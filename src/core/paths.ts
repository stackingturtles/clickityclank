import os from "node:os";
import path from "node:path";

export const OPENCLAW_CONFIG = path.join(os.homedir(), ".openclaw", "openclaw.json");
export const CLICKITYCLANK_DIR = path.join(os.homedir(), ".openclaw", "clickityclank");
export const CLICKITYCLANK_STATE = path.join(CLICKITYCLANK_DIR, "state.json");
export const CLICKITYCLANK_TEMPLATES = path.join(os.homedir(), ".clickityclank", "templates", "roles");
export const CLICKITYCLANK_PROJECTS = path.join(os.homedir(), ".clickityclank", "projects");
export const CLICKITYCLANK_HERMES_DIR = path.join(os.homedir(), ".clickityclank", "hermes");
export const CLICKITYCLANK_HERMES_ROUTES = path.join(CLICKITYCLANK_HERMES_DIR, "routes.json");
export const CLICKITYCLANK_HERMES_CONFIG_FRAGMENT = path.join(CLICKITYCLANK_HERMES_DIR, "hermes-config.fragment.yaml");

export const workspacePathFor = (project: string, channel?: string) =>
  path.join(os.homedir(), ".openclaw", channel ? `workspace-${project}-${channel}` : `workspace-${project}`);

export const clickityclankProjectPathFor = (project: string) => path.join(CLICKITYCLANK_PROJECTS, project);
