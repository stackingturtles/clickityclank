import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { dump as dumpYaml } from "js-yaml";
import { mergeHermesConfig, verifyHermesConfig } from "../src/core/hermesApply.js";
import { reconcileMaps, detectAmbiguousRenames } from "../src/core/reconcile.js";
import { verifyProject } from "../src/core/verify.js";
import type { GlobalState, HermesConfigFragment } from "../src/types/index.js";

const execFileAsync = promisify(execFile);
const cli = path.join(process.cwd(), "node_modules", ".bin", "tsx");
async function tempHome() { return fs.mkdtemp(path.join(os.tmpdir(), "clickityclank-stories-")); }
async function runCli(args: string[], home: string) {
  return execFileAsync(cli, ["src/index.ts", ...args], { env: { ...process.env, HOME: home, CLICKITYCLANK_DISCORD_TOKEN: "token" } });
}

describe("scheduled Linear story delivery support", () => {
  it("STA-462 merges Hermes fragments into live config with deterministic plan buckets and verification", () => {
    const fragment: HermesConfigFragment = {
      group_sessions_per_user: false,
      skills: { external_dirs: ["/repo/.agents/skills"] },
      channel_routes: { "discord:guild:111": { project: "p", channel: "backend", profile: "p-backend", workdir: "/repo", context_file: "/repo/AGENTS.md", skills: ["backend"] } },
      discord: {
        require_mention: false,
        free_response_channels: ["111"],
        no_thread_channels: ["111"],
        auto_thread: false,
        reply_to_mode: "off",
        allow_mentions: { everyone: false, roles: false, users: false, replied_user: false },
        channel_prompts: { "111": "backend prompt" },
        channel_skill_bindings: [{ id: "111", skills: ["backend"] }]
      }
    };
    const live = { unrelated: true, discord: { free_response_channels: ["old"], channel_prompts: { old: "keep" } }, skills: { external_dirs: ["/keep"] } };
    const { merged, plan } = mergeHermesConfig(live, fragment);
    expect(merged.unrelated).toBe(true);
    expect(merged.discord.free_response_channels).toEqual(["old", "111"]);
    expect(merged.discord.channel_prompts.old).toBe("keep");
    expect(merged.channel_routes["discord:guild:111"].project).toBe("p");
    expect(plan.added.some((x) => x.path === "discord.channel_prompts.111")).toBe(true);
    expect(plan.changed.some((x) => x.path === "discord.free_response_channels")).toBe(true);
    expect(plan).toHaveProperty("unchanged");
    expect(plan).toHaveProperty("conflicts");
    expect(verifyHermesConfig(merged, fragment)).toEqual({ ok: true, missing: [] });
  });

  it("STA-463 computes desired-state manifest sync additions, removals, changed field diffs, and rename ambiguity", () => {
    const diff = reconcileMaps(
      [
        { channel: "backend", agentId: "backend", mode: "deep", toolsets: ["file"] },
        { channel: "qa", agentId: "qa" },
        { channel: "old", agentId: "frontend" }
      ],
      [
        { channel: "backend", agentId: "backend", mode: "fast", toolsets: ["skills"] },
        { channel: "frontend", agentId: "frontend" },
        { channel: "ops", agentId: "ops" }
      ]
    );
    expect(diff.additions.map((m) => m.channel)).toEqual(["frontend", "ops"]);
    expect(diff.removals.map((m) => m.channel)).toEqual(["qa", "old"]);
    expect(diff.changed[0].channel).toBe("backend");
    expect(diff.changed[0].diffs.map((d) => d.field)).toEqual(["mode", "toolsets"]);
    expect(detectAmbiguousRenames(diff)).toEqual(["frontend"]);
  });

  it("STA-465 verifies Hermes project files/routes/live config and skill fallback severity", async () => {
    const home = await tempHome();
    const repo = path.join(home, "repo");
    await fs.mkdir(path.join(repo, ".agents", "skills"), { recursive: true });
    const routesFile = path.join(home, "routes.json");
    const fragmentFile = path.join(home, "fragment.yaml");
    const hermesConfig = path.join(home, ".hermes", "config.yaml");
    await fs.mkdir(path.dirname(hermesConfig), { recursive: true });
    await fs.writeFile(path.join(repo, "AGENTS.md"), "# repo\n");
    await fs.writeFile(routesFile, JSON.stringify({ schemaVersion: 1, routes: { "discord:guild:111": { project: "p" } } }));
    await fs.writeFile(fragmentFile, "discord: {}\n");
    await fs.writeFile(hermesConfig, "channel_routes:\n  discord:guild:111: {}\ndiscord:\n  free_response_channels: ['111']\n");
    const state: GlobalState = { version: 1, projects: { p: { runtime: "hermes", guildId: "guild", categoryId: "cat", channelIds: { backend: "111" }, workspacePaths: {}, maps: [{ channel: "backend", agentId: "backend" }], repo, contextFile: path.join(repo, "AGENTS.md"), hermesRoutesFile: routesFile, hermesConfigFragment: fragmentFile, updatedAt: "now" } } };
    const res = await verifyProject("p", state, { discordChannels: [{ id: "cat", type: 4 }, { id: "111", type: 0, parent_id: "cat" }] });
    expect(res.findings.some((f) => f.name === "discord.channel.backend" && f.status === "ok")).toBe(true);
    expect(res.findings.some((f) => f.name === "skill.backend" && f.status === "error")).toBe(true);
  });

  it("STA-464 setup dry-run emits deterministic JSON and does not persist secrets", async () => {
    const home = await tempHome();
    const { stdout } = await runCli(["setup", "--guild-id", "guild", "--runtime", "hermes", "--roles", "frontend,backend,qa", "--dry-run", "--json"], home);
    const out = JSON.parse(stdout);
    expect(out).toMatchObject({ defaultsPath: path.join(home, ".clickityclank", "defaults.yaml"), runtime: "hermes", roles: ["frontend", "backend", "qa"], dryRun: true });
    expect(await fs.access(out.defaultsPath).then(() => true).catch(() => false)).toBe(false);
    expect(stdout).not.toContain("test-token");
  });

  it("STA-466 converts a Discord-originated request into a manifest without runtime mutations", async () => {
    const home = await tempHome();
    const req = path.join(home, "request.yaml");
    const outFile = path.join(home, "manifest.yaml");
    await fs.writeFile(req, dumpYaml({ project: "demo", guildId: "guild", runtime: "hermes", repo: "/repo", defaults: { mode: "balanced" }, maps: [{ channel: "backend", agentId: "backend", mode: "deep" }] }));
    const { stdout } = await runCli(["project", "manifest", "from-request", "--request-file", req, "--output", outFile, "--json"], home);
    const out = JSON.parse(stdout);
    expect(out.ok).toBe(true);
    expect(out.manifest).toMatchObject({ project: "demo", runtime: "hermes", repo: "/repo", maps: [{ channel: "backend", agentId: "backend", mode: "deep" }] });
    expect(out.followUp).toContain("project create demo");
    expect(await fs.readFile(outFile, "utf8")).toContain("runtime: hermes");
    expect(await fs.access(path.join(home, ".openclaw", "clickityclank", "state.json")).then(() => true).catch(() => false)).toBe(false);
  });
});
