import path from "node:path";
import os from "node:os";
import { CLICKITYCLANK_TEMPLATES, OPENCLAW_CONFIG } from "../core/paths.js";
import { ensureDir, fileExists, readJson, writeJsonAtomic } from "../core/io.js";
import { printJson } from "../core/output.js";
import { seedTemplates } from "../core/templates.js";

export async function runInit(opts: { json?: boolean; roles?: string }) {
  const dir = path.resolve(".clickityclank");
  const file = path.join(dir, "config.json");
  if (!(await fileExists(OPENCLAW_CONFIG))) {
    throw new Error(`OpenClaw config missing at ${OPENCLAW_CONFIG}. Run OpenClaw first.`);
  }

  const createdFiles: string[] = [];
  const warnings: string[] = [];

  const roles = (opts.roles || "frontend,backend,qa,handoff,release,mobile")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);

  await seedTemplates(roles);

  if (await fileExists(file)) {
    if (opts.json) return printJson({ ok: true, createdFiles, warnings: ["already initialized"] });
    console.log("already initialized");
    console.log(`templates ready at ${CLICKITYCLANK_TEMPLATES}`);
    return;
  }

  await ensureDir(dir);
  await readJson(OPENCLAW_CONFIG);
  await writeJsonAtomic(file, {
    schemaVersion: 1,
    openclawConfigPath: OPENCLAW_CONFIG,
    machineGlobalStatePath: path.join(os.homedir(), ".openclaw", "clickityclank", "state.json"),
    defaultWorkspaceRoot: path.join(os.homedir(), ".openclaw"),
    templatesRoot: CLICKITYCLANK_TEMPLATES,
    templateRoles: roles,
    discord: {
      guildId: "REQUIRED",
      profile: "explicit-mapping-only"
    }
  });
  createdFiles.push(file);

  if (opts.json) return printJson({ ok: true, createdFiles, warnings });
  console.log(`initialized ${file}`);
  console.log(`templates seeded at ${CLICKITYCLANK_TEMPLATES}`);
}
