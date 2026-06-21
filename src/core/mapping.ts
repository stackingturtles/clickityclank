import { z } from "zod";
import type { MapEntry, ProjectManifest } from "../types/index.js";

const prioritySchema = z.enum(["normal", "fast"]);
const reasoningSchema = z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]);

const modelPolicySchema = z.object({
  provider: z.string().min(1).optional(),
  default: z.string().min(1).optional()
}).refine((v) => v.provider !== undefined || v.default !== undefined, {
  message: "model must include provider or default"
});

const runtimePolicySchema = z.object({
  priority: prioritySchema.optional(),
  reasoning: reasoningSchema.optional(),
  model: modelPolicySchema.optional(),
  toolsets: z.array(z.string().min(1)).min(1).optional(),
  maxTurns: z.number().int().positive().optional()
});

const mapSchema = z.object({
  channel: z.string().min(1),
  agentId: z.string().min(1),
  accountId: z.string().min(1).optional(),
  profile: z.string().min(1).optional(),
  skills: z.array(z.string().min(1)).optional(),
  workdir: z.string().min(1).optional(),
  contextFile: z.string().min(1).optional(),
  mode: z.string().min(1).optional(),
  priority: prioritySchema.optional(),
  reasoning: reasoningSchema.optional(),
  model: modelPolicySchema.optional(),
  toolsets: z.array(z.string().min(1)).min(1).optional(),
  maxTurns: z.number().int().positive().optional()
});

const manifestSchema = z.object({
  project: z.string().min(1),
  runtime: z.enum(["openclaw", "hermes"]).optional(),
  repo: z.string().min(1).optional(),
  contextFile: z.string().min(1).optional(),
  defaults: z.object({ mode: z.string().min(1).optional() }).optional(),
  modes: z.record(runtimePolicySchema.extend({ description: z.string().min(1).optional() })).optional(),
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
  const manifest = manifestSchema.parse(input);
  validateModeReferences(manifest);
  return manifest;
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

function validateModeReferences(manifest: ProjectManifest) {
  const modes: Record<string, boolean> = { fast: true, balanced: true, deep: true };
  for (const name of Object.keys(manifest.modes || {})) modes[name] = true;
  if (manifest.defaults?.mode && !modes[manifest.defaults.mode]) {
    throw new Error(`Unknown default Hermes mode: ${manifest.defaults.mode}`);
  }
  for (const map of manifest.maps) {
    if (map.mode && !modes[map.mode]) {
      throw new Error(`Unknown Hermes mode "${map.mode}" for channel "${map.channel}"`);
    }
  }
}
