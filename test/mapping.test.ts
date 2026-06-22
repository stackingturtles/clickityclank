import { describe, it, expect } from "vitest";
import { parseMapFlags, parseManifest } from "../src/core/mapping.js";

describe("parseMapFlags", () => {
  it("parses colon-delimited mappings", () => {
    const r = parseMapFlags(["fe:hal", "qa:infra"]);
    expect(r).toEqual([
      { channel: "fe", agentId: "hal" },
      { channel: "qa", agentId: "infra" }
    ]);
  });

  it("parses equals-delimited mappings", () => {
    const r = parseMapFlags(["frontend=frontend", "backend=backend"]);
    expect(r).toEqual([
      { channel: "frontend", agentId: "frontend" },
      { channel: "backend", agentId: "backend" }
    ]);
  });

  it("rejects duplicate channels", () => {
    expect(() => parseMapFlags(["fe:hal", "fe:infra"])).toThrow(/Duplicate channel mapping/);
  });
});

describe("parseManifest Hermes modes", () => {
  it("parses defaults, named modes, and channel runtime overrides", () => {
    const manifest = parseManifest({
      project: "linearstories",
      runtime: "hermes",
      defaults: { mode: "balanced" },
      modes: {
        balanced: { priority: "normal", reasoning: "low", toolsets: ["file", "terminal"] },
        deep: { priority: "normal", reasoning: "high", model: { provider: "openai", default: "gpt-5.5" } }
      },
      maps: [
        { channel: "chat", agentId: "assistant" },
        { channel: "backend", agentId: "backend", mode: "deep", reasoning: "xhigh" }
      ]
    });

    expect(manifest.defaults?.mode).toBe("balanced");
    expect(manifest.maps[1]).toMatchObject({ mode: "deep", reasoning: "xhigh" });
  });

  it("accepts built-in modes without redefining them", () => {
    const manifest = parseManifest({
      project: "builtins",
      runtime: "hermes",
      defaults: { mode: "balanced" },
      maps: [
        { channel: "chat", agentId: "assistant", mode: "fast" },
        { channel: "architecture", agentId: "architect", mode: "deep" }
      ]
    });

    expect(manifest.maps.map((m) => m.mode)).toEqual(["fast", "deep"]);
  });

  it("rejects unknown default modes", () => {
    expect(() =>
      parseManifest({
        project: "bad",
        defaults: { mode: "missing" },
        modes: { fast: { priority: "fast" } },
        maps: [{ channel: "chat", agentId: "assistant" }]
      })
    ).toThrow(/Unknown default Hermes mode: missing/);
  });

  it("rejects unknown map modes with the channel name", () => {
    expect(() =>
      parseManifest({
        project: "bad",
        modes: { fast: { priority: "fast" } },
        maps: [{ channel: "backend", agentId: "backend", mode: "missing" }]
      })
    ).toThrow(/Unknown Hermes mode "missing" for channel "backend"/);
  });

  it("rejects invalid reasoning values", () => {
    expect(() =>
      parseManifest({
        project: "bad",
        modes: { fast: { reasoning: "maximum" } },
        maps: [{ channel: "chat", agentId: "assistant" }]
      })
    ).toThrow();
  });

  it("rejects invalid priority values", () => {
    expect(() =>
      parseManifest({
        project: "bad",
        modes: { fast: { priority: "urgent" } },
        maps: [{ channel: "chat", agentId: "assistant" }]
      })
    ).toThrow();
  });

  it("rejects empty toolsets arrays", () => {
    expect(() =>
      parseManifest({
        project: "bad",
        modes: { fast: { toolsets: [] } },
        maps: [{ channel: "chat", agentId: "assistant" }]
      })
    ).toThrow();
  });
});
