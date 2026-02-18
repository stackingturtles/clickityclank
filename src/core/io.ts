import fs from "node:fs/promises";
import path from "node:path";
import { load as loadYaml } from "js-yaml";

export async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

export async function readJson<T>(file: string): Promise<T> {
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as T;
}

export async function writeJsonAtomic(file: string, value: unknown) {
  const dir = path.dirname(file);
  await ensureDir(dir);
  const tmp = `${file}.tmp-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(tmp, file);
}

export async function fileExists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readManifest(file: string): Promise<unknown> {
  const raw = await fs.readFile(file, "utf8");
  if (file.endsWith(".yaml") || file.endsWith(".yml")) return loadYaml(raw);
  return JSON.parse(raw);
}
