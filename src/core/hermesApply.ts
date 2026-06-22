import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CLICKITYCLANK_HERMES_CONFIG_FRAGMENT, HERMES_CONFIG } from "./paths.js";
import { fileExists } from "./io.js";
import { readYamlFile, writeYamlAtomic, mergeArray } from "./config.js";
import type { HermesConfigFragment } from "../types/index.js";

const execFileAsync = promisify(execFile);
export type Change = { path: string; channelId?: string; before?: unknown; after?: unknown };
export type ApplyPlan = { added: Change[]; changed: Change[]; unchanged: Change[]; conflicts: Change[] };

function setMap(target: Record<string, any>, fragment: Record<string, any> | undefined, prefix: string, plan: ApplyPlan) {
  for (const [k, v] of Object.entries(fragment || {})) {
    const p = `${prefix}.${k}`;
    if (!(k in target)) {
      target[k] = v;
      plan.added.push({ path: p, channelId: k, after: v });
    } else if (JSON.stringify(target[k]) !== JSON.stringify(v)) {
      plan.changed.push({ path: p, channelId: k, before: target[k], after: v });
      target[k] = v;
    } else {
      plan.unchanged.push({ path: p, channelId: k, after: v });
    }
  }
}

function setRouteMap(target: Record<string, any>, fragment: Record<string, any> | undefined, plan: ApplyPlan) {
  for (const [k, v] of Object.entries(fragment || {})) {
    const p = `channel_routes.${k}`;
    const channelId = k.split(":")[2];
    if (!(k in target)) {
      target[k] = v;
      plan.added.push({ path: p, channelId, after: v });
    } else if (JSON.stringify(target[k]) !== JSON.stringify(v)) {
      plan.changed.push({ path: p, channelId, before: target[k], after: v });
      target[k] = v;
    } else {
      plan.unchanged.push({ path: p, channelId, after: v });
    }
  }
}

function mergeSkillBindings(existing: any[], next: any[], plan: ApplyPlan) {
  const byId = new Map<string, any>((existing || []).map((x) => [String(x.id), x]));
  for (const binding of next || []) {
    const id = String(binding.id);
    const p = `discord.channel_skill_bindings.${id}`;
    const current = byId.get(id);
    if (!current) {
      byId.set(id, binding);
      plan.added.push({ path: p, channelId: id, after: binding });
    } else if (JSON.stringify(current.skills || []) !== JSON.stringify(binding.skills || [])) {
      byId.set(id, { ...current, skills: binding.skills });
      plan.changed.push({ path: p, channelId: id, before: current, after: binding });
    } else {
      plan.unchanged.push({ path: p, channelId: id, after: current });
    }
  }
  return Array.from(byId.values()).sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function mergeHermesConfig(live: any, fragment: HermesConfigFragment): { merged: any; plan: ApplyPlan } {
  const merged = JSON.parse(JSON.stringify(live || {}));
  const plan: ApplyPlan = { added: [], changed: [], unchanged: [], conflicts: [] };
  merged.discord = merged.discord || {};
  merged.skills = merged.skills || {};
  merged.channel_routes = merged.channel_routes || {};

  for (const key of ["free_response_channels", "no_thread_channels"] as const) {
    const before = merged.discord[key] || [];
    const after = mergeArray(before, fragment.discord[key]);
    const change = { path: `discord.${key}`, before, after };
    if (JSON.stringify(before) === JSON.stringify(after)) plan.unchanged.push(change);
    else plan.changed.push(change);
    merged.discord[key] = after;
  }

  const beforeDirs = merged.skills.external_dirs || [];
  merged.skills.external_dirs = mergeArray(beforeDirs, fragment.skills?.external_dirs || []);
  (JSON.stringify(beforeDirs) === JSON.stringify(merged.skills.external_dirs) ? plan.unchanged : plan.changed).push({
    path: "skills.external_dirs",
    before: beforeDirs,
    after: merged.skills.external_dirs
  });

  for (const [k, v] of Object.entries(fragment.discord || {})) {
    if (["free_response_channels", "no_thread_channels", "channel_prompts", "channel_skill_bindings"].includes(k)) continue;
    if (JSON.stringify(merged.discord[k]) !== JSON.stringify(v)) plan.changed.push({ path: `discord.${k}`, before: merged.discord[k], after: v });
    else plan.unchanged.push({ path: `discord.${k}`, after: v });
    merged.discord[k] = v;
  }

  merged.discord.channel_prompts = merged.discord.channel_prompts || {};
  setMap(merged.discord.channel_prompts, fragment.discord.channel_prompts, "discord.channel_prompts", plan);
  merged.discord.channel_skill_bindings = mergeSkillBindings(merged.discord.channel_skill_bindings || [], fragment.discord.channel_skill_bindings || [], plan);
  setRouteMap(merged.channel_routes, fragment.channel_routes, plan);
  return { merged, plan };
}

function tsForBackup() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export async function applyHermesConfig(opts: { fragmentFile?: string; configFile?: string; dryRun?: boolean; runCheck?: boolean }) {
  const fragmentFile = opts.fragmentFile || CLICKITYCLANK_HERMES_CONFIG_FRAGMENT;
  const configFile = opts.configFile || HERMES_CONFIG;
  if (!(await fileExists(fragmentFile))) throw new Error(`Hermes config fragment not found: ${fragmentFile}`);
  const fragment = await readYamlFile<HermesConfigFragment>(fragmentFile);
  const live = (await fileExists(configFile)) ? await readYamlFile<any>(configFile) : {};
  const { merged, plan } = mergeHermesConfig(live, fragment);
  if (opts.dryRun) return { plan, backupPath: undefined, configFile, fragmentFile };
  const backupPath = `${configFile}.bak.clickityclank.${tsForBackup()}`;
  if (await fileExists(configFile)) await fs.copyFile(configFile, backupPath);
  else await fs.writeFile(backupPath, "{}\n", "utf8");
  await writeYamlAtomic(configFile, merged);
  if (opts.runCheck !== false) {
    try {
      await execFileAsync("hermes", ["config", "check"]);
    } catch (err: any) {
      await fs.copyFile(backupPath, configFile);
      throw new Error(`hermes config check failed; restored ${backupPath}: ${err.stderr || err.message}`);
    }
  }
  return { plan, backupPath, configFile, fragmentFile };
}

export function verifyHermesConfig(live: any, fragment: HermesConfigFragment) {
  const missing: string[] = [];
  for (const id of fragment.discord.free_response_channels || []) {
    if (!(live.discord?.free_response_channels || []).includes(id)) missing.push(`discord.free_response_channels:${id}`);
    if (!(live.discord?.no_thread_channels || []).includes(id)) missing.push(`discord.no_thread_channels:${id}`);
    if (!live.discord?.channel_prompts?.[id]) missing.push(`discord.channel_prompts:${id}`);
  }
  for (const key of Object.keys(fragment.channel_routes || {})) {
    if (!live.channel_routes?.[key]) missing.push(`channel_routes:${key}`);
  }
  return { ok: missing.length === 0, missing };
}
