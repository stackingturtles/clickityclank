import { Command } from "commander";
import { loadState } from "../core/state.js";
import { printJson } from "../core/output.js";
import { applyHermesConfig, verifyHermesConfig } from "../core/hermesApply.js";
import { HERMES_CONFIG } from "../core/paths.js";
import { readYamlFile } from "../core/config.js";
import type { HermesConfigFragment } from "../types/index.js";

export function registerHermes(program: Command) {
  const hermes = program.command("hermes").description("Hermes runtime operations");
  hermes.command("apply <project>")
    .option("--dry-run")
    .option("--json")
    .option("--restart")
    .option("--verify")
    .option("--skip-config-check")
    .action(async (project, opts) => {
      const state = await loadState();
      const p = state.projects[project];
      if (!p) throw new Error(`Project not found in state: ${project}`);
      if ((p.runtime || "openclaw") !== "hermes") throw new Error(`Project is not a Hermes-runtime project: ${project}`);
      if (!p.hermesConfigFragment) throw new Error(`Project has no Hermes config fragment recorded: ${project}`);
      const result = await applyHermesConfig({ fragmentFile: p.hermesConfigFragment, dryRun: !!opts.dryRun, runCheck: !opts.skipConfigCheck });
      let verification: any;
      if (opts.verify && !opts.dryRun) {
        verification = verifyHermesConfig(await readYamlFile<any>(HERMES_CONFIG), await readYamlFile<HermesConfigFragment>(p.hermesConfigFragment));
        if (!verification.ok) process.exitCode = 1;
      }
      const restart = opts.restart ? {
        performed: false,
        reason: "Restart is not performed from the active gateway process by default.",
        command: "hermes gateway restart",
        slashCommand: "/restart"
      } : undefined;
      const out = { ok: !verification || verification.ok, project, ...result, verification, restart };
      if (opts.json) return printJson(out);
      console.log(JSON.stringify(out, null, 2));
    });
}
