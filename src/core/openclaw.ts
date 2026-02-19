import fs from "node:fs/promises";
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

export function ensureAgents(cfg: OpenClawConfig, maps: MapEntry[], project: string, createMissingAgents?: boolean) {
  const ids = new Set((cfg.agents?.list ?? []).map((a: any) => a.id));
  const emojiMap: Record<string, string> = {
    frontend: "🎨",
    fe: "🎨",
    backend: "⚙️",
    be: "⚙️",
    qa: "🧪",
    handoff: "🤝",
    release: "🚀",
    mobile: "📱"
  };

  for (const m of maps) {
    if (ids.has(m.agentId)) continue;
    if (!createMissingAgents) throw new Error(`Unknown agent id: ${m.agentId}`);

    const channel = m.channel;
    const ws = workspacePathFor(project, channel);
    cfg.agents.list.push({
      id: m.agentId,
      workspace: ws,
      identity: {
        name: `${project}-${channel}`,
        theme: `${channel} specialist for ${project}`,
        emoji: emojiMap[channel] ?? "🤖"
      }
    });
    ids.add(m.agentId);
  }
}

function shouldRemoveLegacyProjectBinding(binding: any, project: string) {
  return binding?.match?.channel === "discord" && binding?.match?.projectTag === project;
}

function shouldRemoveProjectChannelBinding(binding: any, guildId: string, channelIdSet: Set<string>) {
  if (binding?.match?.channel !== "discord") return false;
  if (binding?.match?.guildId !== guildId) return false;

  const legacyChannelId = binding?.match?.channelId;
  if (legacyChannelId && channelIdSet.has(String(legacyChannelId))) return true;

  const peer = binding?.match?.peer;
  if (peer?.kind === "channel" && peer?.id && channelIdSet.has(String(peer.id))) return true;

  return false;
}

export function upsertProjectBindings(
  cfg: OpenClawConfig,
  project: string,
  guildId: string,
  channelIds: Record<string, string>,
  maps: MapEntry[]
) {
  cfg.bindings = Array.isArray(cfg.bindings) ? cfg.bindings : [];

  const channelIdSet = new Set(Object.values(channelIds).map(String));

  cfg.bindings = cfg.bindings.filter(
    (b: any) =>
      !shouldRemoveLegacyProjectBinding(b, project) && !shouldRemoveProjectChannelBinding(b, guildId, channelIdSet)
  );

  for (const m of maps) {
    const channelId = channelIds[m.channel];
    if (!channelId) continue;

    cfg.bindings.push({
      agentId: m.agentId,
      match: {
        channel: "discord",
        guildId,
        peer: {
          kind: "channel",
          id: String(channelId)
        }
      }
    });
  }
}

export function removeProjectBindings(
  cfg: OpenClawConfig,
  project: string,
  guildId?: string,
  channelIds?: Record<string, string>
) {
  const channelIdSet = new Set(Object.values(channelIds || {}).map(String));

  cfg.bindings = (cfg.bindings || []).filter((b: any) => {
    if (shouldRemoveLegacyProjectBinding(b, project)) return false;
    if (guildId && channelIdSet.size > 0 && shouldRemoveProjectChannelBinding(b, guildId, channelIdSet)) return false;
    return true;
  });
}

export async function saveOpenClawConfig(cfg: OpenClawConfig) {
  await writeJsonAtomic(OPENCLAW_CONFIG, cfg);
  await readJson(OPENCLAW_CONFIG);
}

export async function restoreOpenClawBackup(backupPath: string) {
  await fs.copyFile(backupPath, OPENCLAW_CONFIG);
}

export async function ensureWorkspace(project: string, channel: string) {
  const ws = workspacePathFor(project, channel);
  await fs.mkdir(ws, { recursive: true });
  return ws;
}

export async function deleteWorkspace(project: string, channel: string) {
  const ws = workspacePathFor(project, channel);
  await fs.rm(ws, { recursive: true, force: true });
  return ws;
}
