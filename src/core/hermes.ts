import fs from "node:fs/promises";
import path from "node:path";
import { dump as dumpYaml } from "js-yaml";
import { ensureDir, fileExists, readJson, writeJsonAtomic } from "./io.js";
import {
  CLICKITYCLANK_HERMES_CONFIG_FRAGMENT,
  CLICKITYCLANK_HERMES_ROUTES,
  clickityclankProjectPathFor
} from "./paths.js";
import type { HermesConfigFragment, HermesRoutesFile, HermesRoute, MapEntry } from "../types/index.js";

export type BuildHermesRoutesOptions = {
  project: string;
  guildId: string;
  channelIds: Record<string, string>;
  maps: MapEntry[];
  repo?: string;
  contextFile?: string;
  sessionKeyMode?: "channel" | "user";
};

export function buildHermesRouteKey(guildId: string, channelId: string) {
  return `discord:${guildId}:${channelId}`;
}

function defaultProfile(project: string, map: MapEntry) {
  return map.profile || `${project}-${map.agentId}`;
}

function defaultSkills(map: MapEntry) {
  return map.skills?.length ? map.skills : [map.agentId];
}

function defaultWorkdir(project: string, repo?: string) {
  return repo || clickityclankProjectPathFor(project);
}

function defaultContextFile(project: string, contextFile?: string, repo?: string) {
  return contextFile || path.join(defaultWorkdir(project, repo), "AGENTS.md");
}

export function buildHermesRoutes(opts: BuildHermesRoutesOptions): HermesRoutesFile {
  const routes: Record<string, HermesRoute> = {};
  for (const map of opts.maps) {
    const channelId = opts.channelIds[map.channel];
    if (!channelId) throw new Error(`Missing channel ID for Hermes route: ${map.channel}`);
    const workdir = map.workdir || defaultWorkdir(opts.project, opts.repo);
    const contextFile = map.contextFile || defaultContextFile(opts.project, opts.contextFile, opts.repo);
    routes[buildHermesRouteKey(opts.guildId, channelId)] = {
      project: opts.project,
      channel: map.channel,
      agentId: map.agentId,
      profile: defaultProfile(opts.project, map),
      skills: defaultSkills(map),
      workdir,
      contextFile,
      sessionKeyMode: opts.sessionKeyMode || "channel"
    };
  }
  return { schemaVersion: 1, routes };
}

export function mergeHermesRoutes(existing: HermesRoutesFile | undefined, next: HermesRoutesFile): HermesRoutesFile {
  return {
    schemaVersion: 1,
    routes: {
      ...(existing?.routes || {}),
      ...next.routes
    }
  };
}

export function removeProjectRoutes(existing: HermesRoutesFile, project: string): HermesRoutesFile {
  const routes = Object.fromEntries(
    Object.entries(existing.routes || {}).filter(([, route]) => route.project !== project)
  );
  return { schemaVersion: 1, routes };
}

export function replaceProjectRoutes(existing: HermesRoutesFile | undefined, project: string, next: HermesRoutesFile): HermesRoutesFile {
  return mergeHermesRoutes(removeProjectRoutes(existing || { schemaVersion: 1, routes: {} }, project), next);
}

function promptForRoute(route: HermesRoute) {
  const skillText = route.skills.length === 1 ? `the \`${route.skills[0]}\` skill` : `the ${route.skills.map((s) => `\`${s}\``).join(", ")} skills`;
  return [
    `You are the ${route.channel} expert for project \`${route.project}\`.`,
    `Project context: ${route.contextFile}`,
    `Working directory: ${route.workdir}`,
    `Use ${skillText} for role-specific behaviour.`,
    "Do not claim true per-channel profile/workdir switching unless Hermes channel_routes is enabled; treat the path above as explicit task context."
  ].join("\n");
}

export function buildHermesConfigFragment(routesFile: HermesRoutesFile): HermesConfigFragment {
  const routeEntries = Object.entries(routesFile.routes || {}).sort(([a], [b]) => a.localeCompare(b));
  const channelIds: string[] = [];
  const channel_prompts: Record<string, string> = {};
  const channel_skill_bindings: { id: string; skills: string[] }[] = [];

  for (const [key, route] of routeEntries) {
    const parts = key.split(":");
    const channelId = parts[2];
    if (!channelId) continue;
    channelIds.push(channelId);
    channel_prompts[channelId] = promptForRoute(route);
    channel_skill_bindings.push({ id: channelId, skills: route.skills });
  }

  return {
    group_sessions_per_user: false,
    discord: {
      require_mention: true,
      free_response_channels: channelIds,
      no_thread_channels: channelIds,
      channel_prompts
    },
    gateway: {
      platforms: {
        discord: {
          extra: {
            channel_skill_bindings
          }
        }
      }
    }
  };
}

export function createProjectContext(opts: { project: string; repo?: string; maps: MapEntry[] }) {
  const lines = [
    `# ${opts.project}`,
    "",
    "You are working inside a ClickityClank-managed Hermes project workspace.",
    "",
    "## Project context"
  ];
  if (opts.repo) lines.push(`- Repo: ${opts.repo}`);
  lines.push("- Keep changes small, testable, and easy to hand off between role channels.");
  lines.push("", "## Role routing");
  for (const map of opts.maps) {
    const skills = defaultSkills(map);
    const skillText = skills.length === 1 ? `the \`${skills[0]}\` Hermes skill` : `the ${skills.map((s) => `\`${s}\``).join(", ")} Hermes skills`;
    lines.push(`- In #${map.channel}, load ${skillText}.`);
  }
  lines.push("", "## Shared rules", "- Run relevant checks before claiming completion.", "- Preserve OpenClaw compatibility unless the task explicitly targets Hermes.");
  return `${lines.join("\n")}\n`;
}

export async function loadHermesRoutes(file = CLICKITYCLANK_HERMES_ROUTES): Promise<HermesRoutesFile> {
  if (!(await fileExists(file))) return { schemaVersion: 1, routes: {} };
  return readJson<HermesRoutesFile>(file);
}

export async function saveHermesRoutes(routes: HermesRoutesFile, file = CLICKITYCLANK_HERMES_ROUTES) {
  await writeJsonAtomic(file, routes);
}

export async function writeHermesConfigFragment(routes: HermesRoutesFile, file = CLICKITYCLANK_HERMES_CONFIG_FRAGMENT) {
  await ensureDir(path.dirname(file));
  const content = `# ClickityClank-managed Hermes config fragment. Merge into ~/.hermes/config.yaml after review.\n${dumpYaml(buildHermesConfigFragment(routes), { lineWidth: 120 })}`;
  await fs.writeFile(file, content, "utf8");
  return file;
}

export async function upsertProjectHermesRoutes(project: string, next: HermesRoutesFile) {
  const routes = replaceProjectRoutes(await loadHermesRoutes(), project, next);
  await saveHermesRoutes(routes);
  await writeHermesConfigFragment(routes);
  return routes;
}

export async function removeProjectHermesRoutes(project: string) {
  const routes = removeProjectRoutes(await loadHermesRoutes(), project);
  await saveHermesRoutes(routes);
  await writeHermesConfigFragment(routes);
  return routes;
}

export async function ensureProjectContext(opts: { project: string; repo?: string; maps: MapEntry[]; contextFile?: string; overwrite?: boolean }) {
  const contextFile = opts.contextFile || path.join(clickityclankProjectPathFor(opts.project), "AGENTS.md");
  if (!opts.overwrite && (await fileExists(contextFile))) return { path: contextFile, created: false };
  await ensureDir(path.dirname(contextFile));
  await fs.writeFile(contextFile, createProjectContext(opts), "utf8");
  return { path: contextFile, created: true };
}
