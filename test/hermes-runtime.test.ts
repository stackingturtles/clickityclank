import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildHermesRouteKey,
  buildHermesRoutes,
  buildHermesConfigFragment,
  createProjectContext,
  removeProjectRoutes,
  replaceProjectRoutes
} from "../src/core/hermes.js";
import type { MapEntry } from "../src/types/index.js";

describe("Hermes runtime support", () => {
  const maps: MapEntry[] = [
    { channel: "frontend", agentId: "frontend", skills: ["frontend"] },
    { channel: "backend", agentId: "backend", skills: ["backend", "typescript"] }
  ];
  const channelIds = { frontend: "111", backend: "222" };

  it("builds deterministic Discord route keys using guild and channel IDs", () => {
    expect(buildHermesRouteKey("guild-1", "111")).toBe("discord:guild-1:111");
  });

  it("builds Hermes route entries with skills, workdir, context and session mode", () => {
    const routes = buildHermesRoutes({
      project: "linearstories",
      guildId: "guild-1",
      channelIds,
      maps,
      repo: "/Users/developer/code/linearstories",
      contextFile: "/Users/developer/code/linearstories/AGENTS.md"
    });

    expect(routes.routes["discord:guild-1:111"]).toEqual({
      project: "linearstories",
      channel: "frontend",
      agentId: "frontend",
      profile: "linearstories-frontend",
      skills: ["frontend"],
      workdir: "/Users/developer/code/linearstories",
      contextFile: "/Users/developer/code/linearstories/AGENTS.md",
      sessionKeyMode: "channel"
    });
    expect(routes.routes["discord:guild-1:222"].skills).toEqual(["backend", "typescript"]);
  });

  it("generates a Hermes config fragment using supported Discord primitives", () => {
    const routes = buildHermesRoutes({
      project: "linearstories",
      guildId: "guild-1",
      channelIds,
      maps,
      repo: "/Users/developer/code/linearstories",
      contextFile: "/Users/developer/code/linearstories/AGENTS.md"
    });

    const fragment = buildHermesConfigFragment(routes);

    expect(fragment.group_sessions_per_user).toBe(false);
    expect(fragment.discord.require_mention).toBe(false);
    expect(fragment.discord.free_response_channels).toEqual(["111", "222"]);
    expect(fragment.discord.no_thread_channels).toEqual(["111", "222"]);
    expect(fragment.discord.auto_thread).toBe(false);
    expect(fragment.discord.reply_to_mode).toBe("off");
    expect(fragment.discord.allow_mentions).toEqual({
      everyone: false,
      roles: false,
      users: false,
      replied_user: false
    });
    expect(fragment.discord.channel_prompts["111"]).toContain("frontend expert");
    expect(fragment.discord.channel_prompts["111"]).toContain("/Users/developer/code/linearstories/AGENTS.md");
    expect(fragment.discord.channel_skill_bindings).toEqual([
      { id: "111", skills: ["frontend"] },
      { id: "222", skills: ["backend", "typescript"] }
    ]);
  });

  it("includes the project-local skill directory in the Hermes config fragment", () => {
    const routes = buildHermesRoutes({
      project: "linearstories",
      guildId: "guild-1",
      channelIds: { backend: "222" },
      maps: [{ channel: "backend", agentId: "backend" }],
      repo: "/Users/developer/code/linearstories",
      contextFile: "/Users/developer/code/linearstories/AGENTS.md"
    });

    expect(buildHermesConfigFragment(routes).skills.external_dirs).toEqual([
      "/Users/developer/code/linearstories/.agents/skills"
    ]);
  });

  it("merges and dedupes external skill directories across multiple projects", () => {
    const routes = {
      schemaVersion: 1 as const,
      routes: {
        "discord:guild-1:111": { project: "linearstories", channel: "frontend", agentId: "frontend", profile: "linearstories-frontend", skills: ["frontend"], workdir: "/repo/linearstories", contextFile: "/repo/linearstories/AGENTS.md", sessionKeyMode: "channel" as const },
        "discord:guild-1:222": { project: "linearstories", channel: "backend", agentId: "backend", profile: "linearstories-backend", skills: ["backend"], workdir: "/repo/linearstories", contextFile: "/repo/linearstories/AGENTS.md", sessionKeyMode: "channel" as const },
        "discord:guild-1:333": { project: "health", channel: "backend", agentId: "backend", profile: "health-backend", skills: ["backend"], workdir: "/repo/health", contextFile: "/repo/health/AGENTS.md", sessionKeyMode: "channel" as const }
      }
    };

    expect(buildHermesConfigFragment(routes).skills.external_dirs).toEqual([
      "/repo/linearstories/.agents/skills",
      "/repo/health/.agents/skills"
    ]);
  });

  it("drops a removed project's external skill directory when no remaining route uses it", () => {
    const existing = {
      schemaVersion: 1 as const,
      routes: {
        "discord:guild-1:111": { project: "linearstories", channel: "frontend", agentId: "frontend", profile: "linearstories-frontend", skills: ["frontend"], workdir: "/repo/linearstories", contextFile: "/repo/linearstories/AGENTS.md", sessionKeyMode: "channel" as const },
        "discord:guild-1:333": { project: "health", channel: "backend", agentId: "backend", profile: "health-backend", skills: ["backend"], workdir: "/repo/health", contextFile: "/repo/health/AGENTS.md", sessionKeyMode: "channel" as const }
      }
    };

    expect(buildHermesConfigFragment(removeProjectRoutes(existing, "linearstories")).skills.external_dirs).toEqual([
      "/repo/health/.agents/skills"
    ]);
  });

  it("creates a project-level AGENTS.md context that names the project-local skill directory", () => {
    const content = createProjectContext({ project: "linearstories", repo: "/repo", maps });

    expect(content).toContain("Project-local skills: `/repo/.agents/skills`");
    expect(content).toContain("For project-local skills, reference the skill by directory name from `/repo/.agents/skills/<skill-name>/SKILL.md`.");
  });

  it("removes only routes for the requested project", () => {
    const existing = {
      schemaVersion: 1 as const,
      routes: {
        "discord:guild-1:111": { project: "linearstories", channel: "frontend", agentId: "frontend", profile: "linearstories-frontend", skills: ["frontend"], workdir: "/repo", contextFile: "/repo/AGENTS.md", sessionKeyMode: "channel" as const },
        "discord:guild-1:333": { project: "health", channel: "health", agentId: "health", profile: "health-health", skills: ["health-coach"], workdir: os.homedir(), contextFile: path.join(os.homedir(), ".clickityclank/projects/health/AGENTS.md"), sessionKeyMode: "channel" as const }
      }
    };

    expect(removeProjectRoutes(existing, "linearstories")).toEqual({
      schemaVersion: 1,
      routes: {
        "discord:guild-1:333": existing.routes["discord:guild-1:333"]
      }
    });
  });

  it("replaces stale routes for the same project when regenerating Hermes routes", () => {
    const existing = {
      schemaVersion: 1 as const,
      routes: {
        "discord:guild-1:old": { project: "linearstories", channel: "old", agentId: "frontend", profile: "linearstories-frontend", skills: ["frontend"], workdir: "/repo", contextFile: "/repo/AGENTS.md", sessionKeyMode: "channel" as const },
        "discord:guild-1:333": { project: "health", channel: "health", agentId: "health", profile: "health-health", skills: ["health"], workdir: "/health", contextFile: "/health/AGENTS.md", sessionKeyMode: "channel" as const }
      }
    };
    const next = buildHermesRoutes({
      project: "linearstories",
      guildId: "guild-1",
      channelIds: { frontend: "111" },
      maps: [{ channel: "frontend", agentId: "frontend" }],
      repo: "/repo",
      contextFile: "/repo/AGENTS.md"
    });

    const replaced = replaceProjectRoutes(existing, "linearstories", next);

    expect(Object.keys(replaced.routes).sort()).toEqual(["discord:guild-1:111", "discord:guild-1:333"]);
    expect(replaced.routes["discord:guild-1:old"]).toBeUndefined();
    expect(replaced.routes["discord:guild-1:333"]).toBe(existing.routes["discord:guild-1:333"]);
  });

  it("creates a project-level AGENTS.md context", () => {
    const content = createProjectContext({ project: "linearstories", repo: "/repo", maps });
    expect(content).toContain("# linearstories");
    expect(content).toContain("Repo: /repo");
    expect(content).toContain("In #frontend, load the `frontend` Hermes skill");
    expect(content).toContain("In #backend, load the `backend`, `typescript` Hermes skills");
  });
});
