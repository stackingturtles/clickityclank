import { describe, expect, it } from "vitest";
import { Command } from "commander";
import { registerProject } from "../src/commands/project.js";

describe("project command registration", () => {
  it("registers sync only once", () => {
    const program = new Command();
    registerProject(program);

    const project = program.commands.find((c) => c.name() === "project");
    expect(project).toBeDefined();

    const syncCommands = (project?.commands || []).filter((c) => c.name() === "sync");
    expect(syncCommands).toHaveLength(1);
  });
});
