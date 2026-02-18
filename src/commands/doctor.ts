import { OPENCLAW_CONFIG } from "../core/paths.js";
import { fileExists, readJson } from "../core/io.js";
import { verifyToken } from "../core/discord.js";
import { printJson } from "../core/output.js";

type Check = { name: string; status: "pass" | "fail" | "warn"; evidence?: string; errorCode?: string };

export async function runDoctor(opts: { json?: boolean; discordToken?: string }) {
  const checks: Check[] = [];

  if (await fileExists(OPENCLAW_CONFIG)) {
    try {
      const cfg = await readJson<any>(OPENCLAW_CONFIG);
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
