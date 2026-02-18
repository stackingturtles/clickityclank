import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { OPENCLAW_CONFIG, workspacePathFor } from "./paths.js";
import { fileExists, readJson, writeJsonAtomic } from "./io.js";
import type { MapEntry } from "../types/index.js";

const AgentSchema = z.object({ id: z.string() });
const ConfigSchema = z.object({
  agents: z.object({ list: z.array(AgentSchema) }),
  bindings: z.array(z.any()).default([]),
  channels: z.object({ discord: z.any() }).optional()
});

export type OpenClawConfig = Record<string, any>;

export async function loadOpenClawConfig(): Promise<OpenClawConfig> {
  if (!(await fileExists(OPENCLAW_CONFIG))) throw new Error(`OpenClaw config not found at ${OPENCLAW_CONFIG}`);
  const cfg = await readJson<OpenClawConfig>(OPENCLAW_CONFIG);
  ConfigSchema.parse(cfg);
  return cfg;
}

export async function backupOpenClawConfig() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `${OPENCLAW_CONFIG}.bak.clickityclank.${ts}`;
  await fs.copyFile(OPENCLAW_CONFIG, backup);
  return backup;
}

export function validateAgentsExist(cfg: OpenClawConfig, maps: MapEntry[]) {
  const ids = new Set((cfg.agents?.list ?? []).map((a: any) => a.id));
  for (const m of maps) {
    if (!ids.has(m.agentId)) throw new Error(`Unknown agent id: ${m.agentId}`);
  }
}

export function upsertProjectBindings(
  cfg: OpenClawConfig,
  project: string,
  guildId: string,
  channelIds: Record<string, string>,
  maps: MapEntry[]
) {
  cfg.bindings = Array.isArray(cfg.bindings) ? cfg.bindings : [];

  cfg.bindings = cfg.bindings.filter(
    (b: any) => !(b?.match?.channel === "discord" && b?.match?.projectTag === project)
  );

  for (const m of maps) {
    const channelId = channelIds[m.channel];
    cfg.bindings.push({
      agentId: m.agentId,
      match: {
        channel: "discord",
        guildId,
        channelId,
        projectTag: project
      }
    });
  }

  cfg.agents = cfg.agents || {};
  cfg.agents.workspaces = cfg.agents.workspaces || {};
  cfg.agents.workspaces[project] = workspacePathFor(project);
}

export function removeProjectBindings(cfg: OpenClawConfig, project: string) {
  cfg.bindings = (cfg.bindings || []).filter(
    (b: any) => !(b?.match?.channel === "discord" && b?.match?.projectTag === project)
  );
  if (cfg?.agents?.workspaces?.[project]) delete cfg.agents.workspaces[project];
}

export async function saveOpenClawConfig(cfg: OpenClawConfig) {
  await writeJsonAtomic(OPENCLAW_CONFIG, cfg);
  await readJson(OPENCLAW_CONFIG);
}

export async function restoreOpenClawBackup(backupPath: string) {
  await fs.copyFile(backupPath, OPENCLAW_CONFIG);
}

export async function ensureWorkspace(project: string) {
  const ws = workspacePathFor(project);
  await fs.mkdir(ws, { recursive: true });
  return ws;
}

export async function deleteWorkspace(project: string) {
  const ws = workspacePathFor(project);
  await fs.rm(ws, { recursive: true, force: true });
  return ws;
}
