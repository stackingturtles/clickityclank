import { z } from "zod";
import type { MapEntry, ProjectManifest } from "../types/index.js";

const mapSchema = z.object({
  channel: z.string().min(1),
  agentId: z.string().min(1),
  accountId: z.string().min(1).optional(),
  profile: z.string().min(1).optional(),
  skills: z.array(z.string().min(1)).optional(),
  workdir: z.string().min(1).optional(),
  contextFile: z.string().min(1).optional()
});

const manifestSchema = z.object({
  project: z.string().min(1),
  runtime: z.enum(["openclaw", "hermes"]).optional(),
  repo: z.string().min(1).optional(),
  contextFile: z.string().min(1).optional(),
  maps: z.array(mapSchema).min(1)
});

export function parseMapFlags(values: string[]): MapEntry[] {
  const maps: MapEntry[] = values.map((v) => {
    const separator = v.includes(":") ? ":" : "=";
    const [channel, agentId] = v.split(separator);
    return { channel: channel?.trim(), agentId: agentId?.trim() } as MapEntry;
  });
  return validateMaps(maps);
}

export function parseManifest(input: unknown): ProjectManifest {
  return manifestSchema.parse(input);
}

export function validateMaps(maps: MapEntry[]): MapEntry[] {
  const parsed = z.array(mapSchema).min(1).parse(maps);
  const seen = new Set<string>();
  for (const m of parsed) {
    if (seen.has(m.channel)) throw new Error(`Duplicate channel mapping: ${m.channel}`);
    seen.add(m.channel);
  }
  return parsed;
}
