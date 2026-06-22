import type { MapEntry } from "../types/index.js";

export type FieldDiff = { field: string; before: unknown; after: unknown };
export type ReconcilePlan = {
  additions: MapEntry[];
  removals: MapEntry[];
  retained: MapEntry[];
  changed: { channel: string; diffs: FieldDiff[]; before: MapEntry; after: MapEntry }[];
  unchanged: MapEntry[];
};

const fields = ["agentId", "accountId", "profile", "skills", "workdir", "contextFile", "mode", "priority", "reasoning", "model", "toolsets", "maxTurns"];

function same(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function reconcileMaps(existing: MapEntry[], desired: MapEntry[]): ReconcilePlan {
  const oldByChannel = new Map(existing.map((m) => [m.channel, m]));
  const newByChannel = new Map(desired.map((m) => [m.channel, m]));
  const plan: ReconcilePlan = { additions: [], removals: [], retained: [], changed: [], unchanged: [] };
  for (const m of desired) {
    const before = oldByChannel.get(m.channel);
    if (!before) {
      plan.additions.push(m);
      continue;
    }
    plan.retained.push(m);
    const diffs = fields
      .filter((f) => !same((before as any)[f], (m as any)[f]))
      .map((f) => ({ field: f, before: (before as any)[f], after: (m as any)[f] }));
    if (diffs.length) plan.changed.push({ channel: m.channel, diffs, before, after: m });
    else plan.unchanged.push(m);
  }
  for (const m of existing) {
    if (!newByChannel.has(m.channel)) plan.removals.push(m);
  }
  return plan;
}

export function detectAmbiguousRenames(plan: ReconcilePlan) {
  const removedAgents = new Set(plan.removals.map((m) => m.agentId));
  return plan.additions.filter((m) => removedAgents.has(m.agentId)).map((m) => m.agentId);
}
