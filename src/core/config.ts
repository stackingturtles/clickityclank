import fs from "node:fs/promises";
import path from "node:path";
import { dump as dumpYaml, load as loadYaml } from "js-yaml";
import { ensureDir, fileExists } from "./io.js";

export async function readYamlFile<T = any>(file: string): Promise<T> {
  const raw = await fs.readFile(file, "utf8");
  return (loadYaml(raw) || {}) as T;
}

export async function writeYamlAtomic(file: string, value: unknown) {
  await ensureDir(path.dirname(file));
  const tmp = `${file}.tmp-${Date.now()}`;
  await fs.writeFile(tmp, dumpYaml(value, { lineWidth: 120, noRefs: true }), "utf8");
  await fs.rename(tmp, file);
}

export async function copyIfExists(from: string, to: string) {
  if (!(await fileExists(from))) return false;
  await ensureDir(path.dirname(to));
  await fs.copyFile(from, to);
  return true;
}

export function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export function mergeArray<T>(a: T[] | undefined, b: T[] | undefined): T[] {
  return unique([...(a || []), ...(b || [])]);
}
