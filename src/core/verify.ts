import fs from "node:fs/promises";
import path from "node:path";
import { OPENCLAW_CONFIG, CLICKITYCLANK_HERMES_ROUTES, CLICKITYCLANK_HERMES_CONFIG_FRAGMENT, HERMES_CONFIG } from "./paths.js";
import { fileExists, readJson } from "./io.js";
import { loadHermesRoutes } from "./hermes.js";
import type { GlobalState } from "../types/index.js";

export type Finding = { status: "ok" | "warning" | "error"; name: string; evidence?: string; repair?: string };

async function canAccess(p: string) { return fileExists(p); }

export async function verifyProject(project: string, state: GlobalState, opts: { discordChannels?: any[] } = {}) {
  const p = state.projects[project];
  if (!p) throw new Error(`Project not found in state: ${project}`);
  const f: Finding[] = [];
  f.push({ status: "ok", name: "state.project", evidence: project });
  if (opts.discordChannels) {
    const category = opts.discordChannels.find((c) => c.id === p.categoryId && c.type === 4);
    f.push(category ? { status: "ok", name: "discord.category", evidence: p.categoryId } : { status: "error", name: "discord.category", evidence: p.categoryId, repair: "recreate category" });
    for (const [ch, id] of Object.entries(p.channelIds || {})) {
      const found = opts.discordChannels.find((c) => c.id === id && c.type === 0);
      if (!found) f.push({ status: "error", name: `discord.channel.${ch}`, evidence: id, repair: "recreate channel" });
      else if (found.parent_id !== p.categoryId) f.push({ status: "error", name: `discord.channel.${ch}.parent`, evidence: `${found.parent_id} != ${p.categoryId}` });
      else f.push({ status: "ok", name: `discord.channel.${ch}`, evidence: id });
    }
  }
  if (p.contextFile) f.push((await canAccess(p.contextFile)) ? { status: "ok", name: "contextFile", evidence: p.contextFile } : { status: "error", name: "contextFile", evidence: p.contextFile, repair: "restore context file" });
  if (p.repo) f.push((await canAccess(p.repo)) ? { status: "ok", name: "repo", evidence: p.repo } : { status: "error", name: "repo", evidence: p.repo });

  if ((p.runtime || "openclaw") === "hermes") {
    for (const file of [p.hermesRoutesFile || CLICKITYCLANK_HERMES_ROUTES, p.hermesConfigFragment || CLICKITYCLANK_HERMES_CONFIG_FRAGMENT]) {
      f.push((await canAccess(file)) ? { status: "ok", name: `hermes.file.${path.basename(file)}`, evidence: file } : { status: "error", name: `hermes.file.${path.basename(file)}`, evidence: file, repair: "refresh Hermes fragments" });
    }
    if (await canAccess(p.hermesRoutesFile || CLICKITYCLANK_HERMES_ROUTES)) {
      const routes = await loadHermesRoutes(p.hermesRoutesFile || CLICKITYCLANK_HERMES_ROUTES);
      for (const id of Object.values(p.channelIds || {})) {
        const key = `discord:${p.guildId}:${id}`;
        f.push(routes.routes?.[key] ? { status: "ok", name: `hermes.routes.${id}`, evidence: key } : { status: "error", name: `hermes.routes.${id}`, evidence: key, repair: "refresh Hermes fragments" });
      }
    }
    if (await canAccess(HERMES_CONFIG)) {
      const live = await fs.readFile(HERMES_CONFIG, "utf8");
      for (const id of Object.values(p.channelIds || {})) {
        f.push(live.includes(String(id)) ? { status: "ok", name: `hermes.live.${id}` } : { status: "warning", name: `hermes.live.${id}`, evidence: "missing from live config", repair: "clickityclank hermes apply" });
      }
    } else f.push({ status: "warning", name: "hermes.live.config", evidence: HERMES_CONFIG });
    for (const m of p.maps || []) {
      const local = p.repo ? path.join(p.repo, ".agents", "skills", m.agentId, "SKILL.md") : "";
      const global = path.join(process.env.HOME || "", ".hermes", "skills", m.agentId, "SKILL.md");
      if (local && await canAccess(local)) f.push({ status: "ok", name: `skill.${m.agentId}`, evidence: local });
      else if (await canAccess(global)) f.push({ status: "warning", name: `skill.${m.agentId}`, evidence: "global fallback" });
      else f.push({ status: "error", name: `skill.${m.agentId}`, evidence: "not found" });
    }
  } else {
    if (!(await canAccess(OPENCLAW_CONFIG))) f.push({ status: "error", name: "openclaw.config", evidence: OPENCLAW_CONFIG });
    else {
      const cfg = await readJson<any>(OPENCLAW_CONFIG);
      for (const m of p.maps || []) {
        const id = p.channelIds[m.channel];
        const binding = (cfg.bindings || []).some((b: any) => b.agentId === m.agentId && (b.match?.peer?.id === id || b.match?.channelId === id));
        f.push(binding ? { status: "ok", name: `openclaw.binding.${m.channel}` } : { status: "error", name: `openclaw.binding.${m.channel}`, repair: "reapply bindings" });
        const ws = p.workspacePaths?.[m.channel];
        if (ws) f.push((await canAccess(ws)) ? { status: "ok", name: `workspace.${m.channel}`, evidence: ws } : { status: "error", name: `workspace.${m.channel}`, evidence: ws, repair: "recreate workspace" });
      }
    }
  }
  return { ok: !f.some((x) => x.status === "error"), findings: f };
}
