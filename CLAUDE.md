# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

clickityclank is a CLI that provisions Discord categories/channels and wires OpenClaw agent bindings with explicit channel-to-agent mappings. It manages machine-global state (`~/.openclaw/clickityclank/state.json`) for repeatable, safe operations with `--plan` and `--dry-run` modes.

## Commands

```bash
bun install          # install dependencies
bun run build        # build with tsup → dist/index.js (ESM, Node 20+)
bun run dev          # run CLI via tsx without building
bun run test         # run all tests (vitest)
bun run lint         # type-check only (tsc --noEmit)
bun run watch        # rebuild on file changes
```

Run a single test file:
```bash
npx vitest run test/mapping.test.ts
```

After building, the CLI can be linked globally:
```bash
npm link
clickityclank --help
```

## Architecture

**Entry point**: `src/index.ts` — CLI setup with `commander`, registers subcommands, global error handler.

**Commands** (`src/commands/`):
- `init.ts` — Seeds role templates to `~/.clickityclank/templates/roles/`
- `doctor.ts` — Health checks (Discord auth, OpenClaw config, drift detection)
- `project.ts` — CRUD + sync for projects (create, delete, sync, list, show)

**Core logic** (`src/core/`):
- `discord.ts` — Discord REST API v10 client (create/delete channels and categories)
- `openclaw.ts` — Reads/mutates `~/.openclaw/openclaw.json` (bindings, scopes, agent list)
- `mapping.ts` — Zod-validated parsing of `--map channel:agentId` flags and YAML manifest files
- `state.ts` — Load/save machine-global state with atomic temp-file writes
- `templates.ts` — Seed and render mustache-style role templates (AGENTS.md, SOUL.md)
- `io.ts` — File I/O helpers (atomic writes, YAML/JSON parsing)
- `output.ts` — Output formatting (JSON mode, Plan display)
- `paths.ts` — Path constants (`~/.openclaw`, `~/.clickityclank`)

**Types**: `src/types/index.ts` — MapEntry, GlobalState, Plan, ProjectState

## Key Patterns

- **ESM with `.js` extensions** — All TypeScript imports use `.js` extensions (required by ESM resolution)
- **Zod for runtime validation** — Mapping inputs and manifests are validated with Zod schemas
- **Atomic file writes** — State and config writes use `.tmp-<timestamp>` intermediates then rename
- **Backup before mutation** — OpenClaw config gets `.bak.clickityclank.<timestamp>` backup before changes
- **Plan/dry-run safety** — Mutating commands support `--plan` (show intent) and `--dry-run` (skip mutations)
- **Project-scoped agents** — `--project-scoped-agents` prefixes agent IDs with project name while reusing shared bot accounts
- **Discord token resolution** — `opts.discordToken` > `CLICKITYCLANK_DISCORD_TOKEN` > `DISCORD_BOT_TOKEN`
- **Strict TypeScript** — All strict mode flags enabled in tsconfig

## Testing

Tests live in `test/` using Vitest with globals enabled. Tests are pure unit tests that mock file I/O and API calls — no real Discord or OpenClaw interaction. Key test files:
- `mapping.test.ts` — parseMapFlags validation
- `openclaw-bindings.test.ts` — upsertProjectBindings / removeProjectBindings
- `doctor-drift.test.ts` — evaluateProjectDriftChecks
- `project-command-registration.test.ts` — sync subcommand registration

## External State Locations

- Machine-global state: `~/.openclaw/clickityclank/state.json`
- OpenClaw config: `~/.openclaw/openclaw.json`
- Agent workspaces: `~/.openclaw/workspace-<project>-<channel>`
- Role templates: `~/.clickityclank/templates/roles/<role>/`
