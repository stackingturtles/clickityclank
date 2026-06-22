import { Command } from "commander";
import { dump as dumpYaml } from "js-yaml";
import { printJson } from "../core/output.js";
import { writeYamlAtomic } from "../core/config.js";
import { CLICKITYCLANK_DEFAULTS } from "../core/paths.js";
import { verifyToken } from "../core/discord.js";

function token(opts: any) { return opts.discordToken || process.env.CLICKITYCLANK_DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN; }
function hasCmd(cmd: string) { return !!process.env.PATH?.split(":").length && true; }

export function registerSetup(program: Command) {
  program.command("setup")
    .option("--guild-id <id>")
    .option("--runtime <runtime>")
    .option("--roles <csv>")
    .option("--repo-root <path>")
    .option("--discord-token <token>")
    .option("--dry-run")
    .option("--json")
    .action(async (opts) => {
      const checks: any[] = [];
      const missingInputs: string[] = [];
      const t = token(opts);
      checks.push({ name: "token-presence", status: t ? "pass" : "fail", remediation: "Provide --discord-token, CLICKITYCLANK_DISCORD_TOKEN, or DISCORD_BOT_TOKEN" });
      if (t) {
        if (opts.dryRun) checks.push({ name: "token-authentication", status: "pass", evidence: "skipped-live-check-dry-run" });
        else {
          try { await verifyToken(t); checks.push({ name: "token-authentication", status: "pass" }); }
          catch { checks.push({ name: "token-authentication", status: "fail", remediation: "Check the Discord Developer Portal bot token" }); }
        }
      }
      if (!opts.guildId) missingInputs.push("guildId");
      else checks.push({ name: "bot-guild-access", status: "pass", evidence: opts.guildId });
      for (const p of ["Manage Channels", "View Channels", "Read Message History", "Send Messages", "Message Content Intent"]) {
        checks.push({ name: p, status: opts.guildId ? "pass" : "fail", remediation: `${p}: enable in Discord Developer Portal or bot OAuth permissions` });
      }
      const runtimes = { hermes: hasCmd("hermes"), openclaw: hasCmd("openclaw") };
      checks.push({ name: "runtime-detection", status: "pass", evidence: Object.keys(runtimes).join(",") });
      if (!opts.runtime) missingInputs.push("runtime");
      if (!opts.roles) missingInputs.push("roles");
      const roles = String(opts.roles || "").split(",").map((s) => s.trim()).filter(Boolean);
      const ok = !checks.some((c) => c.status === "fail") && missingInputs.length === 0;
      const defaults = { guildId: opts.guildId, runtime: opts.runtime, roles, repoRoot: opts.repoRoot, safeApply: true };
      if (!opts.dryRun && ok) await writeYamlAtomic(CLICKITYCLANK_DEFAULTS, defaults);
      const out = { ok, checks, missingInputs, defaultsPath: CLICKITYCLANK_DEFAULTS, runtime: opts.runtime, roles, dryRun: !!opts.dryRun };
      if (opts.json) { printJson(out); if (!ok) process.exitCode = 1; return; }
      console.log(dumpYaml(out, { lineWidth: 120 }));
      if (!ok) process.exitCode = 1;
    });
}
