#!/usr/bin/env node
import { Command } from "commander";
import { runInit } from "./commands/init.js";
import { runDoctor } from "./commands/doctor.js";
import { registerProject } from "./commands/project.js";

const program = new Command();
program.name("clickityclank").description("Discord/OpenClaw project routing CLI").version("0.1.0");

program
  .command("init")
  .option("--json")
  .action(async (opts) => {
    await runInit(opts);
  });

program
  .command("doctor")
  .option("--json")
  .option("--discord-token <token>")
  .action(async (opts) => {
    await runDoctor(opts);
  });

registerProject(program);

program.parseAsync(process.argv).catch((err) => {
  console.error(`ERROR ${err.message}`);
  process.exit(1);
});
