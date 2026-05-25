import type { Plan } from "../types/index.js";

export function printJson(obj: unknown) {
  console.log(JSON.stringify(obj, null, 2));
}

export function emptyPlan(): Plan {
  return {
    discord: { create: [], delete: [] },
    openclaw: { patch: [] },
    hermes: { patch: [] },
    filesystem: { create: [], delete: [] }
  };
}
