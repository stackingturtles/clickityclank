import { describe, expect, it } from "vitest";
import { removeProjectBindings, upsertProjectBindings } from "../src/core/openclaw.js";

describe("openclaw bindings", () => {
  it("writes discord bindings using match.peer and removes legacy projectTag/channelId entries", () => {
    const cfg: any = {
      bindings: [
        {
          agentId: "frontend",
          match: {
            channel: "discord",
            guildId: "g1",
            channelId: "c-frontend",
            projectTag: "linearstories"
          }
        },
        {
          agentId: "backend",
          match: {
            channel: "discord",
            guildId: "g1",
            peer: { kind: "channel", id: "c-backend" }
          }
        },
        {
          agentId: "other",
          match: {
            channel: "discord",
            guildId: "g1",
            peer: { kind: "channel", id: "other-channel" }
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
    const linearstoriesBindings = discordBindings.filter((b: any) =>
      ["frontend", "backend", "qa"].includes(b.agentId)
    );

    expect(linearstoriesBindings).toHaveLength(3);
    for (const b of linearstoriesBindings) {
      expect(b.match.guildId).toBe("g1");
      expect(b.match.channelId).toBeUndefined();
      expect(b.match.projectTag).toBeUndefined();
      expect(b.match.peer?.kind).toBe("channel");
      expect(typeof b.match.peer?.id).toBe("string");
    }

    expect(discordBindings.find((b: any) => b.agentId === "other")).toBeDefined();
  });

  it("removeProjectBindings removes both legacy and peer-based project channel bindings", () => {
    const cfg: any = {
      bindings: [
        {
          agentId: "frontend",
          match: {
            channel: "discord",
            guildId: "g1",
            channelId: "c-frontend",
            projectTag: "linearstories"
          }
        },
        {
          agentId: "backend",
          match: {
            channel: "discord",
            guildId: "g1",
            peer: { kind: "channel", id: "c-backend" }
          }
        },
        {
          agentId: "qa",
          match: {
            channel: "discord",
            guildId: "g1",
            peer: { kind: "channel", id: "c-qa" }
          }
        },
        {
          agentId: "frontend",
          match: {
            channel: "discord",
            guildId: "g2",
            peer: { kind: "channel", id: "c-frontend" }
          }
        }
      ]
    };

    removeProjectBindings(cfg, "linearstories", "g1", {
      frontend: "c-frontend",
      backend: "c-backend",
      qa: "c-qa"
    });

    expect(cfg.bindings).toHaveLength(1);
    expect(cfg.bindings[0].match.guildId).toBe("g2");
  });
});
