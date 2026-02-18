import { CLICKITYCLANK_STATE } from "./paths.js";
import { fileExists, readJson, writeJsonAtomic } from "./io.js";
import type { GlobalState } from "../types/index.js";

export async function loadState(): Promise<GlobalState> {
  if (!(await fileExists(CLICKITYCLANK_STATE))) {
    return { version: 1, projects: {} };
  }
  return readJson<GlobalState>(CLICKITYCLANK_STATE);
}

export async function saveState(state: GlobalState) {
  await writeJsonAtomic(CLICKITYCLANK_STATE, state);
}
