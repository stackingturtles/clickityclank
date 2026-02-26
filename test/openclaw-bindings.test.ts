import { describe, expect, it } from "vitest";
import { removeProjectBindings, upsertProjectBindings } from "../src/core/openclaw.js";

describe("openclaw bindings", () => {
  it("writes discord bindings with peer ids and accountId when account exists", () => {
    const cfg: any = {
      channels: { discord: { accounts: { frontend: {}, backend: {} }, guilds: {} } },
      bindings: [
        {
          agentId: "frontend",
          match: {
            channel: "discord",
            guildId: "g1",
            channelId: "c-frontend",
            projectTag: "linearstories"
          }
        }
      ]
    };

    upsertProjectBindings(
      cfg,
      "linearstories",
      "g1",
      { frontend: "c-frontend", backend: "c-backend", qa: "c-qa" },
      [
        { channel: "frontend", agentId: "frontend" },
        { channel: "backend", agentId: "backend" },
        { channel: "qa", agentId: "qa" }
      ]
    );

    const discordBindings = cfg.bindings.filter((b: any) => b.match?.channel === "discord");
    const linearstoriesBindings = discordBindings.filter((b: any) => ["frontend", "backend", "qa"].includes(b.agentId));

    expect(linearstoriesBindings).toHaveLength(3);
    expect(linearstoriesBindings.find((b: any) => b.agentId === "frontend")?.match.accountId).toBe("frontend");
    expect(linearstoriesBindings.find((b: any) => b.agentId === "backend")?.match.accountId).toBe("backend");
    expect(linearstoriesBindings.find((b: any) => b.agentId === "qa")?.match.accountId).toBeUndefined();

    for (const b of linearstoriesBindings) {
      expect(b.match.guildId).toBe("g1");
      expect(b.match.channelId).toBeUndefined();
      expect(b.match.projectTag).toBeUndefined();
      expect(b.match.peer?.kind).toBe("channel");
      expect(typeof b.match.peer?.id).toBe("string");
    }
  });

  it("auto-manages global and per-account scopes on upsert", () => {
    const cfg: any = {
      channels: {
        discord: {
          guilds: { g1: { channels: {} } },
          accounts: { frontend: { guilds: { g1: { channels: {} } } }, backend: { guilds: { g1: { channels: {} } } } }
        }
      },
      bindings: []
    };

    upsertProjectBindings(
      cfg,
      "p1",
      "g1",
      { frontend: "c1", backend: "c2" },
      [
        { channel: "frontend", agentId: "frontend" },
        { channel: "backend", agentId: "backend" }
      ]
    );

    expect(cfg.channels.discord.guilds.g1.channels.c1.allow).toBe(true);
    expect(cfg.channels.discord.guilds.g1.channels.c2.allow).toBe(true);
    expect(cfg.channels.discord.accounts.frontend.guilds.g1.channels.c1.allow).toBe(true);
    expect(cfg.channels.discord.accounts.backend.guilds.g1.channels.c2.allow).toBe(true);
  });

  it("supports project-scoped agents that reuse shared account ids", () => {
    const cfg: any = {
      channels: {
        discord: {
          guilds: { g1: { channels: {} } },
          accounts: { frontend: { guilds: { g1: { channels: {} } } } }
        }
      },
      bindings: []
    };

    upsertProjectBindings(
      cfg,
      "clickityclank",
      "g1",
      { frontend: "c1" },
      [{ channel: "frontend", agentId: "clickityclank-frontend", accountId: "frontend" }]
    );

    expect(cfg.bindings[0].agentId).toBe("clickityclank-frontend");
    expect(cfg.bindings[0].match.accountId).toBe("frontend");
    expect(cfg.channels.discord.accounts.frontend.guilds.g1.channels.c1.allow).toBe(true);
  });

  it("removeProjectBindings removes only project channel bindings and scoped allowlists", () => {
    const cfg: any = {
      channels: {
        discord: {
          guilds: {
            g1: { channels: { "c-frontend": { allow: true }, "c-backend": { allow: true }, shared: { allow: true } } }
          },
          accounts: {
            frontend: { guilds: { g1: { channels: { "c-frontend": { allow: true }, shared: { allow: true } } } } },
            backend: { guilds: { g1: { channels: { "c-backend": { allow: true } } } } }
          }
        }
      },
      bindings: [
        {
          agentId: "clickityclank-frontend",
          match: { channel: "discord", guildId: "g1", accountId: "frontend", peer: { kind: "channel", id: "c-frontend" } }
        },
        {
          agentId: "clickityclank-backend",
          match: { channel: "discord", guildId: "g1", accountId: "backend", peer: { kind: "channel", id: "c-backend" } }
        },
        {
          agentId: "other",
          match: { channel: "discord", guildId: "g1", accountId: "frontend", peer: { kind: "channel", id: "shared" } }
        }
      ]
    };

    removeProjectBindings(
      cfg,
      "clickityclank",
      "g1",
      { frontend: "c-frontend", backend: "c-backend" },
      [
        { channel: "frontend", agentId: "clickityclank-frontend", accountId: "frontend" },
        { channel: "backend", agentId: "clickityclank-backend", accountId: "backend" }
      ]
    );

    expect(cfg.bindings).toHaveLength(1);
    expect(cfg.bindings[0].agentId).toBe("other");

    expect(cfg.channels.discord.guilds.g1.channels["c-frontend"]).toBeUndefined();
    expect(cfg.channels.discord.guilds.g1.channels["c-backend"]).toBeUndefined();
    expect(cfg.channels.discord.guilds.g1.channels.shared.allow).toBe(true);

    expect(cfg.channels.discord.accounts.frontend.guilds.g1.channels["c-frontend"]).toBeUndefined();
    expect(cfg.channels.discord.accounts.frontend.guilds.g1.channels.shared.allow).toBe(true);
    expect(cfg.channels.discord.accounts.backend.guilds.g1.channels["c-backend"]).toBeUndefined();
  });

  it("upsert is idempotent for existing project channels", () => {
    const cfg: any = {
      channels: { discord: { guilds: { g1: { channels: {} } }, accounts: { frontend: { guilds: { g1: { channels: {} } } } } } },
      bindings: []
    };

    const args: [any, string, string, Record<string, string>, { channel: string; agentId: string; accountId?: string }[]] = [
      cfg,
      "p1",
      "g1",
      { frontend: "c1" },
      [{ channel: "frontend", agentId: "p1-frontend", accountId: "frontend" }]
    ];

    upsertProjectBindings(...args);
    upsertProjectBindings(...args);

    expect(cfg.bindings).toHaveLength(1);
    expect(cfg.bindings[0].agentId).toBe("p1-frontend");
  });
});
