import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { dump as dumpYaml } from "js-yaml";
import { buildHermesConfigFragment, buildHermesRoutes } from "../src/core/hermes.js";

const execFileAsync = promisify(execFile);
const cli = path.join(process.cwd(), "node_modules", ".bin", "tsx");

async function tempHome() {
  return fs.mkdtemp(path.join(os.tmpdir(), "clickityclank-sta460-"));
}

async function writeYaml(file: string, value: unknown) {
  await fs.writeFile(file, dumpYaml(value, { lineWidth: 120, noRefs: true }), "utf8");
}

async function pathExists(file: string) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function runCli(args: string[], home: string) {
  return execFileAsync(cli, ["src/index.ts", ...args], {
    env: {
      ...process.env,
      HOME: home,
      CLICKITYCLANK_DISCORD_TOKEN: "test-token"
    }
  });
}

describe("STA-460 Hermes rollout verification", () => {
  it("project create --runtime hermes --plan shows effective route policies and writes no state", async () => {
    const home = await tempHome();
    const manifest = path.join(home, "manifest.yaml");
    await writeYaml(manifest, {
      project: "demo",
      runtime: "hermes",
      repo: "/repo/demo",
      defaults: { mode: "fast" },
      modes: {
        fast: {
          priority: "fast",
          reasoning: "minimal",
          model: { provider: "openrouter", default: "openai/gpt-4.1-mini" },
          toolsets: ["skills", "memory"]
        },
        deep: {
          priority: "normal",
          reasoning: "high",
          model: { provider: "openai-codex", default: "gpt-5.5" },
          toolsets: ["file", "terminal", "web"]
        }
      },
      maps: [
        { channel: "chat", agentId: "assistant" },
        { channel: "backend", agentId: "backend", mode: "deep" }
      ]
    });

    const { stdout } = await runCli([
      "project", "create", "demo",
      "--guild-id", "guild-1",
      "--runtime", "hermes",
      "--maps-file", manifest,
      "--plan",
      "--json"
    ], home);

    const result = JSON.parse(stdout);
    expect(result.plan.hermes.patch).toEqual(expect.arrayContaining([
      "route:demo/chat->demo-assistant mode:fast model:openai/gpt-4.1-mini",
      "route:demo/backend->demo-backend mode:deep model:gpt-5.5"
    ]));
    expect(await pathExists(path.join(home, ".openclaw", "clickityclank", "state.json"))).toBe(false);
    expect(await pathExists(path.join(home, ".clickityclank", "hermes", "routes.json"))).toBe(false);
    expect(await pathExists(path.join(home, ".clickityclank", "hermes", "hermes-config.fragment.yaml"))).toBe(false);
    expect(await pathExists(path.join(home, ".hermes", "config.yaml"))).toBe(false);
  });

  it("project sync --runtime hermes --dry-run reports all mode-reference errors and writes no fragments", async () => {
    const home = await tempHome();
    const manifest = path.join(home, "manifest.yaml");
    await writeYaml(manifest, {
      project: "demo",
      runtime: "hermes",
      defaults: { mode: "missing-default" },
      modes: { fast: { priority: "fast" } },
      maps: [
        { channel: "chat", agentId: "assistant", mode: "missing-chat" },
        { channel: "backend", agentId: "backend", mode: "missing-backend" }
      ]
    });

    let stderr = "";
    try {
      await runCli([
        "project", "sync", "demo",
        "--guild-id", "guild-1",
        "--runtime", "hermes",
        "--maps-file", manifest,
        "--dry-run",
        "--json"
      ], home);
      throw new Error("Expected sync dry-run to reject invalid mode references");
    } catch (err: any) {
      stderr = err.stderr;
    }

    expect(stderr).toContain("Unknown default Hermes mode: missing-default");
    expect(stderr).toContain("Unknown Hermes mode \"missing-chat\" for channel \"chat\"");
    expect(stderr).toContain("Unknown Hermes mode \"missing-backend\" for channel \"backend\"");

    expect(await pathExists(path.join(home, ".clickityclank", "hermes", "routes.json"))).toBe(false);
    expect(await pathExists(path.join(home, ".clickityclank", "hermes", "hermes-config.fragment.yaml"))).toBe(false);
    expect(await pathExists(path.join(home, ".hermes", "config.yaml"))).toBe(false);
  });

  it("project sync --runtime hermes --dry-run reports schema validation errors before writing fragments", async () => {
    const home = await tempHome();
    const manifest = path.join(home, "manifest.yaml");
    await writeYaml(manifest, {
      project: "demo",
      runtime: "hermes",
      modes: {
        badFast: { priority: "urgent", reasoning: "maximum", toolsets: [] }
      },
      maps: [{ channel: "chat", agentId: "assistant" }]
    });

    let stderr = "";
    try {
      await runCli([
        "project", "sync", "demo",
        "--guild-id", "guild-1",
        "--runtime", "hermes",
        "--maps-file", manifest,
        "--dry-run",
        "--json"
      ], home);
      throw new Error("Expected sync dry-run to reject invalid mode schema");
    } catch (err: any) {
      stderr = err.stderr;
    }

    expect(stderr).toContain("Invalid enum value. Expected 'normal' | 'fast', received 'urgent'");
    expect(stderr).toContain("Invalid enum value. Expected 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh', received 'maximum'");
    expect(stderr).toContain("Array must contain at least 1 element(s)");
    expect(await pathExists(path.join(home, ".clickityclank", "hermes", "routes.json"))).toBe(false);
    expect(await pathExists(path.join(home, ".clickityclank", "hermes", "hermes-config.fragment.yaml"))).toBe(false);
    expect(await pathExists(path.join(home, ".hermes", "config.yaml"))).toBe(false);
  });

  it("serializes identical routes.json and config fragment content for repeated generation", () => {
    const input = {
      project: "demo",
      guildId: "guild-1",
      channelIds: { chat: "111", backend: "222" },
      maps: [
        { channel: "backend", agentId: "backend", mode: "deep" },
        { channel: "chat", agentId: "assistant", mode: "fast" }
      ],
      repo: "/repo/demo"
    };

    const firstRoutes = buildHermesRoutes(input);
    const secondRoutes = buildHermesRoutes(input);
    const firstRoutesJson = JSON.stringify(firstRoutes, null, 2) + "\n";
    const secondRoutesJson = JSON.stringify(secondRoutes, null, 2) + "\n";
    const firstFragment = `# ClickityClank-managed Hermes config fragment. Merge into ~/.hermes/config.yaml after review.\n# channel_routes requires Hermes gateway support; legacy discord.* fields remain the compatibility path.\n${dumpYaml(buildHermesConfigFragment(firstRoutes), { lineWidth: 120, noRefs: true })}`;
    const secondFragment = `# ClickityClank-managed Hermes config fragment. Merge into ~/.hermes/config.yaml after review.\n# channel_routes requires Hermes gateway support; legacy discord.* fields remain the compatibility path.\n${dumpYaml(buildHermesConfigFragment(secondRoutes), { lineWidth: 120, noRefs: true })}`;

    expect(firstRoutesJson).toBe(secondRoutesJson);
    expect(firstFragment).toBe(secondFragment);
    expect(firstFragment).toContain("channel_routes requires Hermes gateway support; legacy discord.* fields remain the compatibility path.");
  });
});
