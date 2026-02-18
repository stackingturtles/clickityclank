import os from "node:os";
import path from "node:path";

export const OPENCLAW_CONFIG = path.join(os.homedir(), ".openclaw", "openclaw.json");
export const CLICKITYCLANK_DIR = path.join(os.homedir(), ".openclaw", "clickityclank");
export const CLICKITYCLANK_STATE = path.join(CLICKITYCLANK_DIR, "state.json");

export const workspacePathFor = (project: string) =>
  path.join(os.homedir(), ".openclaw", `workspace-${project}`);
