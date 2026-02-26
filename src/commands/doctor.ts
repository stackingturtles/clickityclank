import { OPENCLAW_CONFIG } from "../core/paths.js";
import { fileExists, readJson } from "../core/io.js";
import { verifyToken } from "../core/discord.js";
import { printJson } from "../core/output.js";
import { loadState } from "../core/state.js";
import type { GlobalState } from "../types/index.js";

type Check = { name: string; status: "pass" | "fail" | "warn"; evidence?: string; errorCode?: string };

function hasBinding(cfg: any, guildId: string, channelId: string, agentId: string, accountId?: string): boolean {
  return (cfg.bindings || []).some((b: any) => {
    const m = b?.match;
    if (!m || m.channel !== "discord") return false;
    if (String(m.guildId) !== String(guildId)) return false;
    if (b.agentId !== agentId) return false;
    const peerId = String(m?.peer?.id || m?.channelId || "");
    if (peerId !== String(channelId)) return false;
    if (accountId && String(m.accountId || "") !== String(accountId)) return false;
    return true;
  });
}

function hasGlobalGuildChannelScope(cfg: any, guildId: string, channelId: string): boolean {
  return !!cfg?.channels?.discord?.guilds?.[guildId]?.channels?.[channelId]?.allow;
}

function hasAccountChannelScope(cfg: any, accountId: string, guildId: string, channelId: string): boolean {
  return !!cfg?.channels?.discord?.accounts?.[accountId]?.guilds?.[guildId]?.channels?.[channelId]?.allow;
}

export function evaluateProjectDriftChecks(cfg: any, state: GlobalState): Check[] {
  const checks: Check[] = [];
  const accounts = cfg?.channels?.discord?.accounts || {};

  for (const [projectName, p] of Object.entries(state.projects || {})) {
    for (const m of p.maps || []) {
      const channelId = p.channelIds?.[m.channel];
      if (!channelId) continue;
      const accountId = m.accountId || m.agentId;

      if (!accounts[accountId]) {
        checks.push({
          name: `project:${projectName}:${m.channel}:account-match`,
          status: "warn",
          errorCode: "MAPPED_AGENT_HAS_NO_MATCHING_DISCORD_ACCOUNT",
          evidence: `${m.agentId} (expected account ${accountId})`
        });
        continue;
      }

      const bindingExists = hasBinding(cfg, p.guildId, channelId, m.agentId, accountId);
      if (bindingExists && !hasAccountChannelScope(cfg, accountId, p.guildId, channelId)) {
        checks.push({
          name: `project:${projectName}:${m.channel}:account-scope`,
          status: "warn",
          errorCode: "BINDING_EXISTS_BUT_ACCOUNT_SCOPE_MISSING",
          evidence: `account=${accountId} channel=${channelId}`
        });
      }

      if (!hasGlobalGuildChannelScope(cfg, p.guildId, channelId)) {
        checks.push({
          name: `project:${projectName}:${m.channel}:guild-scope`,
          status: "warn",
          errorCode: "GLOBAL_GUILD_ALLOWLIST_MISSING_CHANNEL",
          evidence: `guild=${p.guildId} channel=${channelId}`
        });
      }
    }
  }

  if (!checks.length) {
    checks.push({ name: "project-routing-drift", status: "pass", evidence: "no drift detected" });
  }

  return checks;
}

export async function runDoctor(opts: { json?: boolean; discordToken?: string }) {
  const checks: Check[] = [];

  let parsedCfg: any | undefined;
  if (await fileExists(OPENCLAW_CONFIG)) {
    try {
      const cfg = await readJson<any>(OPENCLAW_CONFIG);
      parsedCfg = cfg;
      if (cfg.agents && cfg.bindings && cfg.channels?.discord) {
        checks.push({ name: "openclaw-config-structure", status: "pass", evidence: OPENCLAW_CONFIG });
      } else {
        checks.push({ name: "openclaw-config-structure", status: "fail", errorCode: "OPENCLAW_CONFIG_INVALID" });
      }
    } catch {
      checks.push({ name: "openclaw-config-parse", status: "fail", errorCode: "OPENCLAW_CONFIG_PARSE_FAILED" });
    }
  } else {
    checks.push({ name: "openclaw-config-presence", status: "fail", errorCode: "OPENCLAW_CONFIG_MISSING" });
  }

  const token = opts.discordToken || process.env.DISCORD_BOT_TOKEN || process.env.CLICKITYCLANK_DISCORD_TOKEN;
  if (!token) {
    checks.push({ name: "discord-token", status: "fail", errorCode: "DISCORD_TOKEN_MISSING" });
  } else {
    try {
      const me = await verifyToken(token);
      checks.push({ name: "discord-auth", status: "pass", evidence: `${me.username ?? "bot"}` });
    } catch {
      checks.push({ name: "discord-auth", status: "fail", errorCode: "DISCORD_AUTH_FAILED" });
    }
  }

  if (parsedCfg) {
    const state = await loadState();
    checks.push(...evaluateProjectDriftChecks(parsedCfg, state));
  }

  const hasFail = checks.some((c) => c.status === "fail");
  if (opts.json) {
    printJson({ checks, ok: !hasFail });
    if (hasFail) process.exitCode = 1;
    return;
  }

  for (const c of checks) {
    console.log(`${c.status.toUpperCase()} ${c.name}${c.errorCode ? ` (${c.errorCode})` : ""}${c.evidence ? `: ${c.evidence}` : ""}`);
  }
  if (hasFail) process.exitCode = 1;
}
