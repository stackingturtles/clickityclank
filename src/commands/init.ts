import path from "node:path";
import os from "node:os";
import { OPENCLAW_CONFIG } from "../core/paths.js";
import { ensureDir, fileExists, readJson, writeJsonAtomic } from "../core/io.js";
import { printJson } from "../core/output.js";

export async function runInit(opts: { json?: boolean }) {
  const dir = path.resolve(".clickityclank");
  const file = path.join(dir, "config.json");
  if (!(await fileExists(OPENCLAW_CONFIG))) {
    throw new Error(`OpenClaw config missing at ${OPENCLAW_CONFIG}. Run OpenClaw first.`);
  }

  const createdFiles: string[] = [];
  const warnings: string[] = [];

  if (await fileExists(file)) {
    if (opts.json) return printJson({ ok: true, createdFiles, warnings: ["already initialized"] });
    console.log("already initialized");
    return;
  }

  await ensureDir(dir);
  await readJson(OPENCLAW_CONFIG);
  await writeJsonAtomic(file, {
    schemaVersion: 1,
    openclawConfigPath: OPENCLAW_CONFIG,
    defaultWorkspaceRoot: path.join(os.homedir(), ".openclaw"),
    discord: {
      guildId: "REQUIRED",
      profile: "explicit-mapping-only"
    }
  });
  createdFiles.push(file);

  if (opts.json) return printJson({ ok: true, createdFiles, warnings });
  console.log(`initialized ${file}`);
}
