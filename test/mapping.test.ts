import { describe, it, expect } from "vitest";
import { parseMapFlags } from "../src/core/mapping.js";

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
