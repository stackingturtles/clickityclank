import { Command } from "commander";
import { readManifest } from "../core/io.js";
import { loadState, saveState } from "../core/state.js";
import { emptyPlan, printJson } from "../core/output.js";
import { parseMapFlags, parseManifest, validateMaps } from "../core/mapping.js";
import {
  backupOpenClawConfig,
  deleteWorkspace,
  ensureAgents,
  ensureWorkspace,
  loadOpenClawConfig,
  removeProjectBindings,
  restoreOpenClawBackup,
  saveOpenClawConfig,
  upsertProjectBindings
} from "../core/openclaw.js";
import { createCategory, createTextChannel, deleteChannel, listGuildChannels } from "../core/discord.js";
import { CLICKITYCLANK_HERMES_CONFIG_FRAGMENT, CLICKITYCLANK_HERMES_ROUTES, workspacePathFor } from "../core/paths.js";
import { applyTemplates } from "../core/templates.js";
import { reconcileMaps, detectAmbiguousRenames } from "../core/reconcile.js";
import { verifyProject } from "../core/verify.js";
import { writeYamlAtomic } from "../core/config.js";
import {
  buildHermesRoutes,
  ensureProjectContext,
  removeProjectHermesRoutes,
  resolveHermesRuntimePolicy,
  upsertProjectHermesRoutes
} from "../core/hermes.js";
import type { HermesManifestDefaults, HermesModeDefinition, MapEntry, RuntimeKind } from "../types/index.js";

function getToken(cmd: any) {
  return cmd.discordToken || process.env.CLICKITYCLANK_DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
}

async function resolveMaps(opts: { map?: string[]; mapsFile?: string }) {
  if (opts.mapsFile) {
    const manifest = parseManifest(await readManifest(opts.mapsFile));
    return {
      projectFromFile: manifest.project,
      runtimeFromFile: manifest.runtime,
      repoFromFile: manifest.repo,
      contextFileFromFile: manifest.contextFile,
      defaultsFromFile: manifest.defaults,
      modesFromFile: manifest.modes,
      maps: validateMaps(manifest.maps)
    };
  }
  const mapFlags = Array.isArray(opts.map) ? opts.map : opts.map ? [opts.map] : [];
  if (!mapFlags.length) throw new Error("Explicit mappings are required. Use --map channel:agentId (repeatable) or --maps-file.");
  return { maps: parseMapFlags(mapFlags) };
}

function hermesPlanRoute(project: string, map: MapEntry, defaults?: HermesManifestDefaults, modes?: Record<string, HermesModeDefinition>) {
  const { mode, runtime } = resolveHermesRuntimePolicy(map, defaults, modes);
  const model = runtime.model?.default ? ` model:${runtime.model.default}` : "";
  return `route:${project}/${map.channel}->${map.profile || `${project}-${map.agentId}`} mode:${mode}${model}`;
}

function resolveRuntime(opts: any, runtimeFromFile?: RuntimeKind): RuntimeKind {
  const runtime = opts.runtime || runtimeFromFile || "openclaw";
  if (runtime !== "openclaw" && runtime !== "hermes") throw new Error(`Unsupported runtime: ${runtime}`);
  return runtime;
}

function applyProjectScopedAgents(name: string, maps: MapEntry[]): MapEntry[] {
  return maps.map((m) => ({
    ...m,
    channel: m.channel,
    agentId: `${name}-${m.agentId}`,
    accountId: m.agentId
  }));
}

export function registerProject(program: Command) {
  const project = program.command("project").description("Project operations");

  project
    .command("create <name>")
    .requiredOption("--guild-id <id>")
    .option(
      "--map <channel:agent>",
      "Explicit channel/agent mapping",
      (value: string, previous: string[] = []) => {
        previous.push(value);
        return previous;
      },
      [] as string[]
    )
    .option("--maps-file <path>")
    .option("--runtime <runtime>", "Runtime backend: openclaw or hermes")
    .option("--repo <path>", "Project repository/workdir for Hermes context")
    .option("--context-file <path>", "Project AGENTS.md/context file for Hermes")
    .option("--discord-token <token>")
    .option("--create-missing-agents")
    .option("--project-scoped-agents", "Create/use project-specific agent IDs and reuse role-matched account IDs")
    .option("--overwrite-templates")
    .option("--dry-run")
    .option("--plan")
    .option("--json")
    .action(async (name, opts) => {
      const token = getToken(opts);
      if (!token) throw new Error("Missing Discord token (CLICKITYCLANK_DISCORD_TOKEN).");

      const { maps: inputMaps, runtimeFromFile, repoFromFile, contextFileFromFile, defaultsFromFile, modesFromFile } = await resolveMaps(opts);
      const runtime = resolveRuntime(opts, runtimeFromFile);
      const repo = opts.repo || repoFromFile;
      const contextFile = opts.contextFile || contextFileFromFile;
      const defaults = defaultsFromFile;
      const modes = modesFromFile;
      const maps = opts.projectScopedAgents ? applyProjectScopedAgents(name, inputMaps) : inputMaps;

      let cfg: any | undefined;
      if (runtime === "openclaw") {
        cfg = await loadOpenClawConfig();
        ensureAgents(cfg, maps, name, !!opts.createMissingAgents);
      }

      const plan = emptyPlan();
      plan.discord.create.push(`category:${name}`);
      for (const m of maps) {
        plan.discord.create.push(`channel:${name}/${m.channel}`);
        if (runtime === "openclaw") {
          plan.filesystem.create.push(workspacePathFor(name, m.channel));
          plan.openclaw.patch.push(`binding:${name}/${m.channel}->${m.agentId}`);
          plan.openclaw.patch.push(`scope:global+account channel ${m.channel}`);
        } else {
          plan.hermes.patch.push(hermesPlanRoute(name, m, defaults, modes));
        }
      }
      if (runtime === "hermes") {
        plan.filesystem.create.push(contextFile || `~/.clickityclank/projects/${name}/AGENTS.md`);
        plan.hermes.patch.push(CLICKITYCLANK_HERMES_ROUTES);
        plan.hermes.patch.push(CLICKITYCLANK_HERMES_CONFIG_FRAGMENT);
      }

      if (opts.plan || opts.dryRun) {
        if (opts.json) return printJson({ ok: true, runtime, plan });
        console.log(JSON.stringify(plan, null, 2));
        if (opts.dryRun) return;
      }

      const channels = await listGuildChannels(token, opts.guildId);
      let category = channels.find((c) => c.type === 4 && c.name === name);
      if (!category) category = await createCategory(token, opts.guildId, name);

      const channelIds: Record<string, string> = {};
      const workspacePaths: Record<string, string> = {};
      const templateActions: string[] = [];

      for (const m of maps) {
        const existing = channels.find((c) => c.type === 0 && c.parent_id === category.id && c.name === m.channel);
        const created = existing ?? (await createTextChannel(token, opts.guildId, category.id, m.channel));
        channelIds[m.channel] = created.id;

        if (runtime === "openclaw") {
          const ws = await ensureWorkspace(name, m.channel);
          workspacePaths[m.channel] = ws;
          templateActions.push(
            ...(await applyTemplates({
              project: name,
              channel: m.channel,
              agentId: m.agentId,
              workspacePath: ws,
              overwrite: !!opts.overwriteTemplates
            }))
          );
        }
      }

      let hermesRoutesFile: string | undefined;
      let hermesConfigFragment: string | undefined;
      let hermesContextFile: string | undefined;
      if (runtime === "openclaw" && cfg) {
        const backup = await backupOpenClawConfig();
        try {
          upsertProjectBindings(cfg, name, opts.guildId, channelIds, maps);
          await saveOpenClawConfig(cfg);
        } catch (e) {
          await restoreOpenClawBackup(backup);
          throw e;
        }
      } else {
        const projectContext = await ensureProjectContext({ project: name, repo, maps, contextFile, overwrite: !!opts.overwriteTemplates });
        templateActions.push(`${projectContext.created ? "created" : "exists"}:${projectContext.path}`);
        hermesContextFile = projectContext.path;
        const nextRoutes = buildHermesRoutes({ project: name, guildId: opts.guildId, channelIds, maps, repo, contextFile: projectContext.path, defaults, modes });
        await upsertProjectHermesRoutes(name, nextRoutes);
        hermesRoutesFile = CLICKITYCLANK_HERMES_ROUTES;
        hermesConfigFragment = CLICKITYCLANK_HERMES_CONFIG_FRAGMENT;
      }

      const state = await loadState();
      state.projects[name] = {
        runtime,
        guildId: opts.guildId,
        categoryId: category.id,
        channelIds,
        workspacePaths,
        maps,
        repo,
        contextFile: runtime === "hermes" ? hermesContextFile : contextFile,
        hermesRoutesFile,
        hermesConfigFragment,
        updatedAt: new Date().toISOString()
      };
      await saveState(state);

      const out = { ok: true, runtime, project: name, categoryId: category.id, channelIds, workspacePaths, templateActions, hermesRoutesFile, hermesConfigFragment };
      if (opts.json) return printJson(out);
      console.log(JSON.stringify(out, null, 2));
    });

  project
    .command("delete <name>")
    .option("--discord-token <token>")
    .option("--yes")
    .option("--dry-run")
    .option("--plan")
    .option("--json")
    .action(async (name, opts) => {
      const state = await loadState();
      const p = state.projects[name];
      if (!p) throw new Error(`Project not found in state: ${name}`);

      const plan = emptyPlan();
      const runtime = p.runtime || "openclaw";
      for (const cid of Object.values(p.channelIds)) plan.discord.delete.push(`channel:${cid}`);
      plan.discord.delete.push(`category:${p.categoryId}`);
      if (runtime === "openclaw") {
        plan.openclaw.patch.push(`remove bindings for ${name}`);
        plan.openclaw.patch.push(`remove channel scopes for ${name}`);
        for (const ws of Object.values(p.workspacePaths || {})) plan.filesystem.delete.push(ws);
      } else {
        plan.hermes.patch.push(`remove routes for ${name}`);
        plan.hermes.patch.push(CLICKITYCLANK_HERMES_ROUTES);
        plan.hermes.patch.push(CLICKITYCLANK_HERMES_CONFIG_FRAGMENT);
      }

      if (opts.plan || opts.dryRun) {
        if (opts.json) return printJson({ ok: true, plan });
        console.log(JSON.stringify(plan, null, 2));
        if (opts.dryRun) return;
      }

      if (!opts.yes) throw new Error("Refusing delete without --yes.");
      const token = getToken(opts);
      if (!token) throw new Error("Missing Discord token (CLICKITYCLANK_DISCORD_TOKEN).");

      for (const cid of Object.values(p.channelIds)) {
        try {
          await deleteChannel(token, cid);
        } catch {
          // continue cleanup
        }
      }
      try {
        await deleteChannel(token, p.categoryId);
      } catch {
        // continue cleanup
      }

      if (runtime === "openclaw") {
        const cfg = await loadOpenClawConfig();
        const backup = await backupOpenClawConfig();
        try {
          removeProjectBindings(cfg, name, p.guildId, p.channelIds, p.maps);
          await saveOpenClawConfig(cfg);
        } catch (e) {
          await restoreOpenClawBackup(backup);
          throw e;
        }

        for (const m of p.maps) await deleteWorkspace(name, m.channel);
      } else {
        await removeProjectHermesRoutes(name);
      }
      delete state.projects[name];
      await saveState(state);

      const out = { ok: true, deleted: name };
      if (opts.json) return printJson(out);
      console.log(`deleted ${name}`);
    });

  project
    .command("sync <name>")
    .description("Reconcile local state with Discord and runtime config")
    .option("--guild-id <id>", "Guild ID to adopt/create state when the project is not yet tracked")
    .option(
      "--map <channel:agent>",
      "Explicit channel/agent mapping",
      (value: string, previous: string[] = []) => {
        previous.push(value);
        return previous;
      },
      [] as string[]
    )
    .option("--maps-file <path>")
    .option("--runtime <runtime>", "Runtime backend: openclaw or hermes")
    .option("--repo <path>", "Project repository/workdir for Hermes context")
    .option("--context-file <path>", "Project AGENTS.md/context file for Hermes")
    .option("--discord-token <token>")
    .option("--create-missing-agents")
    .option("--delete-removed-channels")
    .option("--allow-rename")
    .option("--dry-run")
    .option("--plan")
    .option("--json")
    .action(async (name, opts) => {
      const state = await loadState();
      const p = state.projects[name];
      if (!p) {
        if (!opts.guildId) throw new Error(`Project not found in state: ${name}. Pass --guild-id and --map to adopt or create it.`);
        const token = getToken(opts);
        if (!token) throw new Error("Missing Discord token (CLICKITYCLANK_DISCORD_TOKEN).");

        const { maps: inputMaps, runtimeFromFile, repoFromFile, contextFileFromFile, defaultsFromFile, modesFromFile } = await resolveMaps(opts);
        const runtime = resolveRuntime(opts, runtimeFromFile);
        const repo = opts.repo || repoFromFile;
        const contextFile = opts.contextFile || contextFileFromFile;
        const defaults = defaultsFromFile;
        const modes = modesFromFile;
        const maps = inputMaps;

        let cfg: any | undefined;
        if (runtime === "openclaw") {
          cfg = await loadOpenClawConfig();
          ensureAgents(cfg, maps, name, !!opts.createMissingAgents);
        }

        const guildChannels = await listGuildChannels(token, opts.guildId);
        const actions: string[] = [];
        let category = guildChannels.find((c) => c.type === 4 && c.name === name);
        if (category) {
          actions.push(`adopt category:${name}`);
        } else {
          actions.push(`create category:${name}`);
          if (!(opts.plan || opts.dryRun)) category = await createCategory(token, opts.guildId, name);
        }

        const channelIds: Record<string, string> = {};
        const workspacePaths: Record<string, string> = {};
        const templateActions: string[] = [];
        for (const m of maps) {
          const existing = category
            ? guildChannels.find((c) => c.type === 0 && c.parent_id === category?.id && c.name === m.channel)
            : undefined;
          if (existing) {
            actions.push(`adopt channel:${name}/${m.channel}`);
            channelIds[m.channel] = existing.id;
          } else {
            actions.push(`create channel:${name}/${m.channel}`);
            if (!(opts.plan || opts.dryRun) && category) {
              const ch = await createTextChannel(token, opts.guildId, category.id, m.channel);
              channelIds[m.channel] = ch.id;
            }
          }
        }

        if (runtime === "openclaw") {
          actions.push("update bindings + scopes");
          for (const m of maps) actions.push(`ensure workspace:${workspacePathFor(name, m.channel)}`);
        } else {
          actions.push("refresh Hermes config fragment");
        }

        if (opts.plan || opts.dryRun) {
          const result = { ok: true, project: name, runtime, actions };
          if (opts.json) return printJson(result);
          if (actions.length === 0) {
            console.log(`${name}: in sync`);
          } else {
            console.log(`${name}: ${actions.length} action(s) needed`);
            for (const a of actions) console.log(`  - ${a}`);
          }
          return;
        }

        if (!category) throw new Error(`Unable to create or adopt category: ${name}`);
        for (const m of maps) {
          if (runtime === "openclaw") {
            const ws = await ensureWorkspace(name, m.channel);
            workspacePaths[m.channel] = ws;
            templateActions.push(
              ...(await applyTemplates({
                project: name,
                channel: m.channel,
                agentId: m.agentId,
                workspacePath: ws,
                overwrite: false
              }))
            );
          }
        }

        let hermesRoutesFile: string | undefined;
        let hermesConfigFragment: string | undefined;
        let hermesContextFile: string | undefined;
        if (runtime === "openclaw" && cfg) {
          const backup = await backupOpenClawConfig();
          try {
            upsertProjectBindings(cfg, name, opts.guildId, channelIds, maps);
            await saveOpenClawConfig(cfg);
          } catch (e) {
            await restoreOpenClawBackup(backup);
            throw e;
          }
        } else {
          const projectContext = await ensureProjectContext({ project: name, repo, maps, contextFile, overwrite: false });
          templateActions.push(`${projectContext.created ? "created" : "exists"}:${projectContext.path}`);
          hermesContextFile = projectContext.path;
          const nextRoutes = buildHermesRoutes({ project: name, guildId: opts.guildId, channelIds, maps, repo, contextFile: projectContext.path, defaults, modes });
          await upsertProjectHermesRoutes(name, nextRoutes);
          hermesRoutesFile = CLICKITYCLANK_HERMES_ROUTES;
          hermesConfigFragment = CLICKITYCLANK_HERMES_CONFIG_FRAGMENT;
        }

        state.projects[name] = {
          runtime,
          guildId: opts.guildId,
          categoryId: category.id,
          channelIds,
          workspacePaths,
          maps,
          repo,
          contextFile: runtime === "hermes" ? hermesContextFile : contextFile,
          hermesRoutesFile,
          hermesConfigFragment,
          updatedAt: new Date().toISOString()
        };
        await saveState(state);

        const out = { ok: true, runtime, project: name, categoryId: category.id, channelIds, workspacePaths, templateActions, hermesRoutesFile, hermesConfigFragment, actions };
        if (opts.json) return printJson(out);
        console.log(JSON.stringify(out, null, 2));
        return;
      }

      const runtime = p.runtime || "openclaw";

      if (opts.mapsFile || (opts.map && opts.map.length)) {
        const token = getToken(opts);
        if (!token) throw new Error("Missing Discord token (CLICKITYCLANK_DISCORD_TOKEN).");
        const { maps: desiredMaps, runtimeFromFile, repoFromFile, contextFileFromFile, defaultsFromFile, modesFromFile } = await resolveMaps(opts);
        const requestedRuntime = opts.runtime || runtimeFromFile;
        if (requestedRuntime && requestedRuntime !== runtime) throw new Error(`Project ${name} is tracked as runtime ${runtime}; refusing conflicting --runtime ${requestedRuntime}`);
        const diff = reconcileMaps(p.maps || [], desiredMaps);
        const ambiguous = detectAmbiguousRenames(diff);
        if (ambiguous.length && !opts.allowRename) throw new Error(`Ambiguous channel rename for agent(s): ${ambiguous.join(", ")}. Pass --allow-rename or use explicit migration flags.`);
        const result = { ok: true, project: name, runtime, additions: diff.additions, removals: diff.removals, retained: diff.retained, changed: diff.changed, unchanged: diff.unchanged, orphaned: diff.removals.map((m) => ({ channel: m.channel, channelId: p.channelIds[m.channel] })) };
        if (opts.plan || opts.dryRun) {
          if (opts.json) return printJson(result);
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        const guildChannels = await listGuildChannels(token, p.guildId);
        let category = guildChannels.find((c) => c.type === 4 && c.id === p.categoryId);
        if (!category) category = await createCategory(token, p.guildId, name);
        const updatedChannelIds: Record<string, string> = { ...p.channelIds };
        for (const m of diff.additions) {
          const existing = guildChannels.find((c) => c.type === 0 && c.parent_id === category?.id && c.name === m.channel);
          const ch = existing ?? (await createTextChannel(token, p.guildId, category.id, m.channel));
          updatedChannelIds[m.channel] = ch.id;
        }
        if (opts.deleteRemovedChannels) {
          for (const m of diff.removals) {
            const cid = updatedChannelIds[m.channel];
            if (cid) await deleteChannel(token, cid).catch(() => undefined);
            delete updatedChannelIds[m.channel];
          }
        } else {
          for (const m of diff.removals) delete updatedChannelIds[m.channel];
        }
        p.maps = desiredMaps;
        p.channelIds = updatedChannelIds;
        if (repoFromFile) p.repo = repoFromFile;
        if (contextFileFromFile) p.contextFile = contextFileFromFile;
        if (runtime === "openclaw") {
          const cfg = await loadOpenClawConfig();
          ensureAgents(cfg, p.maps, name, !!opts.createMissingAgents);
          const backup = await backupOpenClawConfig();
          try { upsertProjectBindings(cfg, name, p.guildId, updatedChannelIds, p.maps); await saveOpenClawConfig(cfg); }
          catch (e) { await restoreOpenClawBackup(backup); throw e; }
        } else {
          const nextRoutes = buildHermesRoutes({ project: name, guildId: p.guildId, channelIds: updatedChannelIds, maps: p.maps, repo: p.repo, contextFile: p.contextFile, defaults: defaultsFromFile, modes: modesFromFile });
          await upsertProjectHermesRoutes(name, nextRoutes);
        }
        p.updatedAt = new Date().toISOString();
        await saveState(state);
        if (opts.json) return printJson({ ...result, channelIds: updatedChannelIds });
        console.log(JSON.stringify({ ...result, channelIds: updatedChannelIds }, null, 2));
        return;
      }

      let cfg: any | undefined;
      if (runtime === "openclaw") {
        cfg = await loadOpenClawConfig();
        ensureAgents(cfg, p.maps, name, !!opts.createMissingAgents);
      }

      const token = getToken(opts);
      if (!token) throw new Error("Missing Discord token (CLICKITYCLANK_DISCORD_TOKEN).");

      const guildChannels = await listGuildChannels(token, p.guildId);

      const actions: string[] = [];
      let category = guildChannels.find((c) => c.type === 4 && c.id === p.categoryId);
      let categoryRecreated = false;
      if (!category) {
        actions.push(`recreate category:${name}`);
        if (!(opts.plan || opts.dryRun)) {
          category = await createCategory(token, p.guildId, name);
          p.categoryId = category.id;
          categoryRecreated = true;
        }
      }

      const updatedChannelIds: Record<string, string> = { ...p.channelIds };

      for (const m of p.maps) {
        const expectedId = p.channelIds[m.channel];
        const exists = expectedId && guildChannels.some((c) => c.id === expectedId);
        if (!exists) {
          actions.push(`recreate channel:${name}/${m.channel}`);
          if (!(opts.plan || opts.dryRun) && category) {
            const ch = await createTextChannel(token, p.guildId, category.id, m.channel);
            updatedChannelIds[m.channel] = ch.id;
          }
        }
      }

      const channelsChanged = Object.entries(updatedChannelIds).some(
        ([k, v]) => p.channelIds[k] !== v
      ) || categoryRecreated;

      if (channelsChanged) {
        actions.push(runtime === "openclaw" ? "update bindings + scopes" : "update Hermes routes");
      }

      if (runtime === "openclaw") {
        for (const m of p.maps) {
          const ws = workspacePathFor(name, m.channel);
          try {
            await import("node:fs/promises").then((fs) => fs.access(ws));
          } catch {
            actions.push(`recreate workspace:${ws}`);
            if (!(opts.plan || opts.dryRun)) {
              await ensureWorkspace(name, m.channel);
              await applyTemplates({
                project: name,
                channel: m.channel,
                agentId: m.agentId,
                workspacePath: ws,
                overwrite: false
              });
            }
          }
        }
      } else {
        actions.push("refresh Hermes config fragment");
      }

      if (opts.plan || opts.dryRun) {
        const result = { ok: true, project: name, actions };
        if (opts.json) return printJson(result);
        if (actions.length === 0) {
          console.log(`${name}: in sync`);
        } else {
          console.log(`${name}: ${actions.length} action(s) needed`);
          for (const a of actions) console.log(`  - ${a}`);
        }
        return;
      }

      if (runtime === "openclaw" && cfg) {
        const backup = await backupOpenClawConfig();
        try {
          upsertProjectBindings(cfg, name, p.guildId, updatedChannelIds, p.maps);
          await saveOpenClawConfig(cfg);
        } catch (e) {
          await restoreOpenClawBackup(backup);
          throw e;
        }
      } else {
        const nextRoutes = buildHermesRoutes({
          project: name,
          guildId: p.guildId,
          channelIds: updatedChannelIds,
          maps: p.maps,
          repo: p.repo,
          contextFile: p.contextFile
        });
        await upsertProjectHermesRoutes(name, nextRoutes);
      }

      p.channelIds = updatedChannelIds;
      p.updatedAt = new Date().toISOString();
      await saveState(state);

      const out = {
        ok: true,
        project: name,
        actions,
        channelIds: updatedChannelIds,
        syncedBindings: Object.keys(updatedChannelIds || {}).length
      };
      if (opts.json) return printJson(out);
      if (actions.length === 0) {
        console.log(`${name}: in sync`);
      } else {
        console.log(`${name}: synced (${actions.length} action(s))`);
        for (const a of actions) console.log(`  - ${a}`);
      }
    });

  project
    .command("verify <name>")
    .option("--discord-token <token>")
    .option("--json")
    .action(async (name, opts) => {
      const state = await loadState();
      const p = state.projects[name];
      if (!p) throw new Error(`Project not found in state: ${name}`);
      let discordChannels: any[] | undefined;
      const token = getToken(opts);
      if (token) discordChannels = await listGuildChannels(token, p.guildId).catch(() => undefined);
      const result = await verifyProject(name, state, { discordChannels });
      if (opts.json) printJson(result);
      else console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
    });

  project
    .command("repair <name>")
    .option("--discord-token <token>")
    .option("--plan")
    .option("--dry-run")
    .option("--json")
    .action(async (name, opts) => {
      const state = await loadState();
      const p = state.projects[name];
      if (!p) throw new Error(`Project not found in state: ${name}`);
      const token = getToken(opts);
      const discordChannels = token ? await listGuildChannels(token, p.guildId).catch(() => undefined) : undefined;
      const verification = await verifyProject(name, state, { discordChannels });
      const repairs = verification.findings.filter((f) => f.repair).map((f) => ({ name: f.name, action: f.repair, status: f.status }));
      if (opts.plan || opts.dryRun) {
        const out = { ok: true, project: name, repairs, verification };
        if (opts.json) return printJson(out);
        console.log(JSON.stringify(out, null, 2));
        return;
      }
      if (!token && verification.findings.some((f) => f.name.startsWith("discord."))) throw new Error("Missing Discord token (CLICKITYCLANK_DISCORD_TOKEN).");
      if ((p.runtime || "openclaw") === "hermes") {
        const nextRoutes = buildHermesRoutes({ project: name, guildId: p.guildId, channelIds: p.channelIds, maps: p.maps, repo: p.repo, contextFile: p.contextFile });
        await upsertProjectHermesRoutes(name, nextRoutes);
      } else {
        const cfg = await loadOpenClawConfig();
        const backup = await backupOpenClawConfig();
        try { upsertProjectBindings(cfg, name, p.guildId, p.channelIds, p.maps); await saveOpenClawConfig(cfg); }
        catch (e) { await restoreOpenClawBackup(backup); throw e; }
      }
      const out = { ok: true, project: name, repairsApplied: repairs };
      if (opts.json) return printJson(out);
      console.log(JSON.stringify(out, null, 2));
    });

  const manifest = project.command("manifest").description("Manifest helper operations");
  manifest
    .command("from-request")
    .requiredOption("--request-file <path>")
    .option("--output <path>")
    .option("--json")
    .action(async (opts) => {
      const req = await readManifest(opts.requestFile) as any;
      const missingFields = ["project", "guildId", "runtime"].filter((f) => !req[f]);
      if (!Array.isArray(req.maps) || req.maps.length === 0) missingFields.push("maps");
      if (req.runtime && req.runtime !== "openclaw" && req.runtime !== "hermes") throw new Error(`Unsupported runtime: ${req.runtime}`);
      if (missingFields.length) {
        const out = { ok: false, missingFields };
        if (opts.json) { printJson(out); process.exitCode = 1; return; }
        throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
      }
      const manifestOut: any = { project: req.project, runtime: req.runtime, maps: req.maps };
      for (const k of ["repo", "contextFile", "defaults", "modes"]) if (req[k]) manifestOut[k] = req[k];
      if (opts.output) await writeYamlAtomic(opts.output, manifestOut);
      const followUp = `clickityclank project create ${req.project} --guild-id ${req.guildId} --maps-file ${opts.output || "<manifest>"} --plan --dry-run --json`;
      const out = { ok: true, manifest: manifestOut, output: opts.output, followUp };
      if (opts.json) return printJson(out);
      console.log(JSON.stringify(out, null, 2));
    });

  project.command("list").option("--json").action(async (opts) => {
    const state = await loadState();
    const items = Object.entries(state.projects).map(([name, v]) => ({
      project: name,
      runtime: v.runtime || "openclaw",
      guildId: v.guildId,
      categoryId: v.categoryId,
      channels: Object.keys(v.channelIds || {}),
      workspacePaths: v.workspacePaths
    }));
    if (opts.json) return printJson(items);
    for (const i of items) console.log(`${i.project} -> ${Object.keys(i.workspacePaths || {}).length} workspaces (${i.categoryId})`);
  });

  project.command("show <name>").option("--json").action(async (name, opts) => {
    const state = await loadState();
    const p = state.projects[name];
    if (!p) throw new Error(`Project not found in state: ${name}`);
    const payload = { project: name, ...p };
    if (opts.json) return printJson(payload);
    console.log(JSON.stringify(payload, null, 2));
  });
}
