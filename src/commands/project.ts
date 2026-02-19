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
import { workspacePathFor } from "../core/paths.js";
import { applyTemplates } from "../core/templates.js";

function getToken(cmd: any) {
  return cmd.discordToken || process.env.CLICKITYCLANK_DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
}

async function resolveMaps(opts: { map?: string[]; mapsFile?: string }) {
  if (opts.mapsFile) {
    const manifest = parseManifest(await readManifest(opts.mapsFile));
    return { projectFromFile: manifest.project, maps: validateMaps(manifest.maps) };
  }
  const mapFlags = Array.isArray(opts.map) ? opts.map : opts.map ? [opts.map] : [];
  if (!mapFlags.length) throw new Error("Explicit mappings are required. Use --map channel:agentId (repeatable) or --maps-file.");
  return { maps: parseMapFlags(mapFlags) };
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
    .option("--discord-token <token>")
    .option("--create-missing-agents")
    .option("--overwrite-templates")
    .option("--dry-run")
    .option("--plan")
    .option("--json")
    .action(async (name, opts) => {
      const token = getToken(opts);
      if (!token) throw new Error("Missing Discord token (CLICKITYCLANK_DISCORD_TOKEN).");

      const { maps } = await resolveMaps(opts);
      const cfg = await loadOpenClawConfig();
      ensureAgents(cfg, maps, name, !!opts.createMissingAgents);

      const plan = emptyPlan();
      plan.discord.create.push(`category:${name}`);
      for (const m of maps) {
        plan.discord.create.push(`channel:${name}/${m.channel}`);
        plan.filesystem.create.push(workspacePathFor(name, m.channel));
        plan.openclaw.patch.push(`binding:${name}/${m.channel}->${m.agentId}`);
      }

      if (opts.plan || opts.dryRun) {
        if (opts.json) return printJson({ ok: true, plan });
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

      const backup = await backupOpenClawConfig();
      try {
        upsertProjectBindings(cfg, name, opts.guildId, channelIds, maps);
        await saveOpenClawConfig(cfg);
      } catch (e) {
        await restoreOpenClawBackup(backup);
        throw e;
      }

      const state = await loadState();
      state.projects[name] = {
        guildId: opts.guildId,
        categoryId: category.id,
        channelIds,
        workspacePaths,
        maps,
        updatedAt: new Date().toISOString()
      };
      await saveState(state);

      const out = { ok: true, project: name, categoryId: category.id, channelIds, workspacePaths, templateActions };
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
      for (const cid of Object.values(p.channelIds)) plan.discord.delete.push(`channel:${cid}`);
      plan.discord.delete.push(`category:${p.categoryId}`);
      plan.openclaw.patch.push(`remove bindings for ${name}`);
      for (const ws of Object.values(p.workspacePaths || {})) plan.filesystem.delete.push(ws);

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

      const cfg = await loadOpenClawConfig();
      const backup = await backupOpenClawConfig();
      try {
        removeProjectBindings(cfg, name, p.guildId, p.channelIds);
        await saveOpenClawConfig(cfg);
      } catch (e) {
        await restoreOpenClawBackup(backup);
        throw e;
      }

      for (const m of p.maps) await deleteWorkspace(name, m.channel);
      delete state.projects[name];
      await saveState(state);

      const out = { ok: true, deleted: name };
      if (opts.json) return printJson(out);
      console.log(`deleted ${name}`);
    });

  project.command("list").option("--json").action(async (opts) => {
    const state = await loadState();
    const items = Object.entries(state.projects).map(([name, v]) => ({
      project: name,
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
