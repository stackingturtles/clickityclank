import { describe, it, expect } from "vitest";
import { parseMapFlags } from "../src/core/mapping.js";

describe("parseMapFlags", () => {
  it("parses valid mappings", () => {
    const r = parseMapFlags(["fe:hal", "qa:infra"]);
    expect(r).toEqual([
      { channel: "fe", agentId: "hal" },
      { channel: "qa", agentId: "infra" }
    ]);
  });

  it("rejects duplicate channels", () => {
    expect(() => parseMapFlags(["fe:hal", "fe:infra"])).toThrow(/Duplicate channel mapping/);
  });
});
