import fs from "node:fs/promises";
import path from "node:path";
import { dump as dumpYaml } from "js-yaml";
import { ensureDir, fileExists, readJson, writeJsonAtomic } from "./io.js";
import {
  CLICKITYCLANK_HERMES_CONFIG_FRAGMENT,
  CLICKITYCLANK_HERMES_ROUTES,
  clickityclankProjectPathFor
} from "./paths.js";
import type {
  HermesConfigFragment,
  HermesManifestDefaults,
  HermesModeDefinition,
  HermesRoute,
  HermesRoutesFile,
  HermesRuntimePolicy,
  MapEntry
} from "../types/index.js";

export type BuildHermesRoutesOptions = {
  project: string;
  guildId: string;
  channelIds: Record<string, string>;
  maps: MapEntry[];
  repo?: string;
  contextFile?: string;
  sessionKeyMode?: "channel" | "user";
  defaults?: HermesManifestDefaults;
  modes?: Record<string, HermesModeDefinition>;
};

export const BUILT_IN_HERMES_MODES: Record<"fast" | "balanced" | "deep", HermesModeDefinition> = {
  fast: {
    description: "Low-latency interactive chat with a reduced tool surface.",
    priority: "fast",
    reasoning: "minimal",
    toolsets: ["skills", "memory", "session_search", "clarify"]
  },
  balanced: {
    description: "Default project work with moderate reasoning and core development tools.",
    priority: "normal",
    reasoning: "low",
    toolsets: ["file", "terminal", "skills", "memory", "session_search", "todo"]
  },
  deep: {
    description: "Coding, architecture, security, legal, and incident work where correctness beats latency.",
    priority: "normal",
    reasoning: "high",
    toolsets: ["file", "terminal", "web", "delegation", "skills", "memory", "session_search", "todo"]
  }
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

function projectLocalSkillDir(workdir: string) {
  return path.join(workdir, ".agents", "skills");
}

function runtimeOverrides(map: MapEntry): HermesRuntimePolicy {
  const out: HermesRuntimePolicy = {};
  if (map.priority) out.priority = map.priority;
  if (map.reasoning) out.reasoning = map.reasoning;
  if (map.model) out.model = map.model;
  if (map.toolsets) out.toolsets = map.toolsets;
  if (map.maxTurns) out.maxTurns = map.maxTurns;
  return out;
}

function mergeRuntimePolicy(base: HermesRuntimePolicy, override: HermesRuntimePolicy): HermesRuntimePolicy {
  const out: HermesRuntimePolicy = { ...base, ...override };
  if (base.model || override.model) out.model = { ...(base.model || {}), ...(override.model || {}) };
  if (override.toolsets) out.toolsets = [...override.toolsets];
  else if (base.toolsets) out.toolsets = [...base.toolsets];
  return out;
}

function cleanRuntimePolicy(policy: HermesRuntimePolicy): HermesRuntimePolicy | undefined {
  const out: HermesRuntimePolicy = {};
  if (policy.priority) out.priority = policy.priority;
  if (policy.reasoning) out.reasoning = policy.reasoning;
  if (policy.model && (policy.model.provider || policy.model.default)) out.model = { ...policy.model };
  if (policy.toolsets?.length) out.toolsets = [...policy.toolsets];
  if (policy.maxTurns) out.maxTurns = policy.maxTurns;
  return Object.keys(out).length ? out : undefined;
}

function resolveHermesMode(map: MapEntry, defaults?: HermesManifestDefaults) {
  return map.mode || defaults?.mode || "balanced";
}

function modeDefinitions(modes?: Record<string, HermesModeDefinition>): Record<string, HermesModeDefinition> {
  const merged: Record<string, HermesModeDefinition> = { ...BUILT_IN_HERMES_MODES };
  for (const [name, mode] of Object.entries(modes || {})) {
    const base = merged[name] || {};
    merged[name] = mergeRuntimePolicy(base, mode) as HermesModeDefinition;
    if (mode.description) merged[name].description = mode.description;
  }
  return merged;
}

export function resolveHermesRuntimePolicy(
  map: MapEntry,
  defaults?: HermesManifestDefaults,
  modes?: Record<string, HermesModeDefinition>
): { mode: string; runtime: HermesRuntimePolicy } {
  const mode = resolveHermesMode(map, defaults);
  const definitions = modeDefinitions(modes);
  const base = definitions[mode];
  if (!base) throw new Error(`Unknown Hermes mode "${mode}" for channel "${map.channel}"`);
  const { description: _description, ...policy } = base;
  return { mode, runtime: cleanRuntimePolicy(mergeRuntimePolicy(policy, runtimeOverrides(map))) || {} };
}

export function buildHermesRoutes(opts: BuildHermesRoutesOptions): HermesRoutesFile {
  const routeEntries: [string, HermesRoute][] = [];
  for (const map of opts.maps) {
    const channelId = opts.channelIds[map.channel];
    if (!channelId) throw new Error(`Missing channel ID for Hermes route: ${map.channel}`);
    const workdir = map.workdir || defaultWorkdir(opts.project, opts.repo);
    const contextFile = map.contextFile || defaultContextFile(opts.project, opts.contextFile, opts.repo);
    const { mode, runtime } = resolveHermesRuntimePolicy(map, opts.defaults, opts.modes);
    routeEntries.push([buildHermesRouteKey(opts.guildId, channelId), {
      project: opts.project,
      channel: map.channel,
      agentId: map.agentId,
      profile: defaultProfile(opts.project, map),
      skills: defaultSkills(map),
      workdir,
      contextFile,
      sessionKeyMode: opts.sessionKeyMode || "channel",
      mode,
      runtime
    }]);
  }
  return { schemaVersion: 1, routes: Object.fromEntries(routeEntries.sort(([a], [b]) => a.localeCompare(b))) };
}

export function mergeHermesRoutes(existing: HermesRoutesFile | undefined, next: HermesRoutesFile): HermesRoutesFile {
  const routes = {
    ...(existing?.routes || {}),
    ...next.routes
  };
  return {
    schemaVersion: 1,
    routes: Object.fromEntries(Object.entries(routes).sort(([a], [b]) => a.localeCompare(b)))
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
  const modeText = route.mode && route.runtime
    ? [
        `Hermes runtime mode: ${route.mode}.`,
        route.runtime.priority ? `Priority: ${route.runtime.priority}.` : undefined,
        route.runtime.reasoning ? `Reasoning: ${route.runtime.reasoning}.` : undefined
      ].filter(Boolean).join(" ")
    : undefined;
  return [
    `You are the ${route.channel} expert for project \`${route.project}\`.`,
    modeText,
    `Project context: ${route.contextFile}`,
    `Working directory: ${route.workdir}`,
    `Use ${skillText} for role-specific behaviour.`,
    "Do not claim true per-channel profile/workdir switching unless Hermes channel_routes is enabled; treat the path above as explicit task context."
  ].filter(Boolean).join("\n");
}

function channelRouteFor(route: HermesRoute) {
  return {
    project: route.project,
    channel: route.channel,
    profile: route.profile,
    workdir: route.workdir,
    context_file: route.contextFile,
    skills: route.skills,
    mode: route.mode,
    runtime: route.runtime
  };
}

export function buildHermesConfigFragment(routesFile: HermesRoutesFile): HermesConfigFragment {
  const routeEntries = Object.entries(routesFile.routes || {}).sort(([a], [b]) => a.localeCompare(b));
  const channelIds: string[] = [];
  const channel_prompts: Record<string, string> = {};
  const channel_skill_bindings: { id: string; skills: string[] }[] = [];
  const channel_routes: NonNullable<HermesConfigFragment["channel_routes"]> = {};
  const externalSkillDirs: string[] = [];
  const seenExternalSkillDirs = new Set<string>();

  for (const [key, route] of routeEntries) {
    const parts = key.split(":");
    const channelId = parts[2];
    if (!channelId) continue;
    channelIds.push(channelId);
    channel_prompts[channelId] = promptForRoute(route);
    channel_skill_bindings.push({ id: channelId, skills: route.skills });
    channel_routes[key] = channelRouteFor(route);

    const skillDir = projectLocalSkillDir(route.workdir);
    if (!seenExternalSkillDirs.has(skillDir)) {
      seenExternalSkillDirs.add(skillDir);
      externalSkillDirs.push(skillDir);
    }
  }

  return {
    group_sessions_per_user: false,
    skills: {
      external_dirs: externalSkillDirs
    },
    // Hermes gateway support required: channel_routes is the pre-model-call policy path.
    // Legacy discord.* fields below remain for current gateway compatibility.
    channel_routes,
    discord: {
      require_mention: false,
      free_response_channels: channelIds,
      no_thread_channels: channelIds,
      auto_thread: false,
      reply_to_mode: "off",
      allow_mentions: {
        everyone: false,
        roles: false,
        users: false,
        replied_user: false
      },
      channel_prompts,
      channel_skill_bindings
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
  const skillDir = projectLocalSkillDir(opts.repo || clickityclankProjectPathFor(opts.project));
  lines.push(`- Project-local skills: \`${skillDir}\``);
  lines.push("- Keep changes small, testable, and easy to hand off between role channels.");
  lines.push("- For project-local skills, reference the skill by directory name from `" + skillDir + "/<skill-name>/SKILL.md`.");
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
  const content = `# ClickityClank-managed Hermes config fragment. Merge into ~/.hermes/config.yaml after review.\n# channel_routes requires Hermes gateway support; legacy discord.* fields remain the compatibility path.\n${dumpYaml(buildHermesConfigFragment(routes), { lineWidth: 120, noRefs: true })}`;
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
