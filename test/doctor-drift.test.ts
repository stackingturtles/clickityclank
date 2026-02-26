import { describe, expect, it } from "vitest";
import { evaluateProjectDriftChecks } from "../src/commands/doctor.js";

describe("doctor drift checks", () => {
  it("passes when bindings and scopes are aligned", () => {
    const cfg: any = {
      bindings: [
        {
          agentId: "p-frontend",
          match: {
            channel: "discord",
            guildId: "g1",
            accountId: "frontend",
            peer: { kind: "channel", id: "c1" }
          }
        }
      ],
      channels: {
        discord: {
          guilds: { g1: { channels: { c1: { allow: true } } } },
          accounts: { frontend: { guilds: { g1: { channels: { c1: { allow: true } } } } } }
        }
      }
    };

    const state: any = {
      version: 1,
      projects: {
        p: {
          guildId: "g1",
          categoryId: "cat",
          channelIds: { frontend: "c1" },
          workspacePaths: { frontend: "/tmp/ws" },
          maps: [{ channel: "frontend", agentId: "p-frontend", accountId: "frontend" }],
          updatedAt: new Date().toISOString()
        }
      }
    };

    const checks = evaluateProjectDriftChecks(cfg, state);
    expect(checks).toEqual([{ name: "project-routing-drift", status: "pass", evidence: "no drift detected" }]);
  });

  it("warns when mapped account is missing", () => {
    const cfg: any = { bindings: [], channels: { discord: { guilds: {}, accounts: {} } } };
    const state: any = {
      version: 1,
      projects: {
        p: {
          guildId: "g1",
          categoryId: "cat",
          channelIds: { frontend: "c1" },
          workspacePaths: { frontend: "/tmp/ws" },
          maps: [{ channel: "frontend", agentId: "p-frontend", accountId: "frontend" }],
          updatedAt: new Date().toISOString()
        }
      }
    };

    const checks = evaluateProjectDriftChecks(cfg, state);
    expect(checks.some((c) => c.errorCode === "MAPPED_AGENT_HAS_NO_MATCHING_DISCORD_ACCOUNT")).toBe(true);
  });

  it("warns when binding exists but account scope is missing", () => {
    const cfg: any = {
      bindings: [
        {
          agentId: "p-frontend",
          match: { channel: "discord", guildId: "g1", accountId: "frontend", peer: { kind: "channel", id: "c1" } }
        }
      ],
      channels: {
        discord: {
          guilds: { g1: { channels: { c1: { allow: true } } } },
          accounts: { frontend: { guilds: { g1: { channels: {} } } } }
        }
      }
    };
    const state: any = {
      version: 1,
      projects: {
        p: {
          guildId: "g1",
          categoryId: "cat",
          channelIds: { frontend: "c1" },
          workspacePaths: { frontend: "/tmp/ws" },
          maps: [{ channel: "frontend", agentId: "p-frontend", accountId: "frontend" }],
          updatedAt: new Date().toISOString()
        }
      }
    };

    const checks = evaluateProjectDriftChecks(cfg, state);
    expect(checks.some((c) => c.errorCode === "BINDING_EXISTS_BUT_ACCOUNT_SCOPE_MISSING")).toBe(true);
  });

  it("warns when global guild allowlist is missing mapped channel", () => {
    const cfg: any = {
      bindings: [],
      channels: {
        discord: {
          guilds: { g1: { channels: {} } },
          accounts: { frontend: { guilds: { g1: { channels: { c1: { allow: true } } } } } }
        }
      }
    };
    const state: any = {
      version: 1,
      projects: {
        p: {
          guildId: "g1",
          categoryId: "cat",
          channelIds: { frontend: "c1" },
          workspacePaths: { frontend: "/tmp/ws" },
          maps: [{ channel: "frontend", agentId: "p-frontend", accountId: "frontend" }],
          updatedAt: new Date().toISOString()
        }
      }
    };

    const checks = evaluateProjectDriftChecks(cfg, state);
    expect(checks.some((c) => c.errorCode === "GLOBAL_GUILD_ALLOWLIST_MISSING_CHANNEL")).toBe(true);
  });
});
