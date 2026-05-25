import { describe, expect, it } from "vitest";
import { Command } from "commander";
import { registerProject } from "../src/commands/project.js";

describe("project command registration", () => {
  function projectCommand() {
    const program = new Command();
    registerProject(program);
    return program.commands.find((c) => c.name() === "project");
  }

  it("registers sync only once", () => {
    const project = projectCommand();
    expect(project).toBeDefined();

    const syncCommands = (project?.commands || []).filter((c) => c.name() === "sync");
    expect(syncCommands).toHaveLength(1);
  });

  it("registers sync with create-style runtime, mapping and repo options", () => {
    const project = projectCommand();
    const sync = project?.commands.find((c) => c.name() === "sync");

    expect(sync?.options.map((o) => o.long).sort()).toEqual(
      expect.arrayContaining([
        "--guild-id",
        "--map",
        "--maps-file",
        "--runtime",
        "--repo",
        "--context-file",
        "--dry-run",
        "--plan"
      ])
    );
  });
});
