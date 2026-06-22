#!/usr/bin/env node
import { Command } from "commander";
import { runInit } from "./commands/init.js";
import { runDoctor } from "./commands/doctor.js";
import { registerProject } from "./commands/project.js";
import { registerHermes } from "./commands/hermes.js";
import { registerSetup } from "./commands/setup.js";

const program = new Command();
program.name("clickityclank").description("Discord/OpenClaw project routing CLI").version("0.2.2");

program
  .command("init")
  .option("--json")
  .option("--roles <csv>", "Role templates to seed, e.g. frontend,backend,qa,mobiledev")
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
registerHermes(program);
registerSetup(program);

program.parseAsync(process.argv).catch((err) => {
  console.error(`ERROR ${err.message}`);
  process.exit(1);
});
