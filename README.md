# clickityclank

Provision Discord Project→Agent routing and OpenClaw/Hermes project-role agent workspaces with explicit mappings.

➡️ **Start here:** [GETTING-STARTED.md](./GETTING-STARTED.md)

## What it does (MVP)

- Creates Discord categories/channels for a project
- Wires OpenClaw bindings using explicit channel→agent maps
- Writes Hermes Discord channel prompt/skill routing fragments when `--runtime hermes` is selected
- Creates machine-global state for repeatable operations
- Supports safe planning with `--plan` and `--dry-run`

> `init` seeds role templates under:
> `~/.clickityclank/templates/roles/<role>/{AGENTS.md,SOUL.md}`

---

## Install (development/local)

```bash
git clone https://github.com/stackingturtles/clickityclank.git
cd clickityclank
bun install
bun run build
npm link
```

Verify:

```bash
clickityclank --help
```

---

## Required credentials

clickityclank uses two Discord concepts:

1. **Control-plane provisioning token** (used by CLI to create categories/channels)
2. **Runtime bot accounts** (used by OpenClaw to actually reply in channels)

Set provisioning token env var:

```bash
export CLICKITYCLANK_DISCORD_TOKEN='YOUR_DISCORD_BOT_TOKEN'
```

### Where to get Discord bot token

1. Open: `https://discord.com/developers/applications`
2. Create/open your provisioning bot application
3. Go to **Bot** (left sidebar)
4. Click **Reset Token** (if needed), then **Copy**
5. Set it in your shell as `CLICKITYCLANK_DISCORD_TOKEN`

---

## How to get Discord Guild ID

1. In Discord app: **User Settings → Advanced → Developer Mode = ON**
2. Right-click your server icon
3. Click **Copy Server ID**

Use that value as `--guild-id`.

---

## Critical requirement: runtime bot accounts per role

If you want each channel to reply as its dedicated role bot (not shared legacy identities), you must create and configure runtime bot accounts in OpenClaw.

Minimum role bots for a standard project:
- `frontend`
- `backend`
- `qa`

### How to create each role bot in Discord Developer Portal

1. Go to `https://discord.com/developers/applications`
2. Click **New Application** (example name: `Frontend`)
3. Open app → **Bot** → **Add Bot**
4. Copy token
5. OAuth2 → **URL Generator**
   - Scopes: `bot`
   - Permissions:
     - View Channels
     - Read Message History
     - Send Messages
     - Manage Channels (recommended for setup automation)
6. Invite bot to your server

Repeat for backend and qa bots.

### OpenClaw account naming convention (important)

For automatic role pinning, the Discord runtime `accountId` should match the agent id.

Example:
- accountId `frontend` ↔ agentId `frontend`
- accountId `backend` ↔ agentId `backend`
- accountId `qa` ↔ agentId `qa`

When this naming matches, clickityclank will add `accountId` to channel bindings automatically and prevent cross-bot replies.

---

## Quick project setup flow

### 1) Initialize local clickityclank config

```bash
clickityclank init --roles frontend,backend,qa,mobiledev
```

### 2) Validate environment

```bash
clickityclank doctor
```

### 3) Plan a project create (no mutation)

```bash
clickityclank project create linearstories \
  --guild-id 957153563694473286 \
  --map frontend:frontend \
  --map backend:backend \
  --map qa:qa \
  --map mobiledev:mobiledev \
  --map infra:infra \
  --project-scoped-agents \
  --plan --dry-run
```

With `--project-scoped-agents`, maps become project-specific agent IDs (e.g. `linearstories-frontend`) while reusing the role bot account (`frontend`).

### 4) Apply for real

```bash
clickityclank project create linearstories \
  --guild-id 957153563694473286 \
  --map frontend:frontend \
  --map backend:backend \
  --map qa:qa \
  --map mobiledev:mobiledev \
  --map infra:infra \
  --project-scoped-agents
```

---

## Commands (MVP)

- `clickityclank init [--roles <csv>] [--json]`
- `clickityclank doctor [--json] [--discord-token <token>]`
- `clickityclank project create <name> --guild-id <id> (--map <channel:agentId>... | --maps-file <file>) [--runtime openclaw|hermes] [--repo <path>] [--context-file <path>] [--create-missing-agents] [--project-scoped-agents] [--overwrite-templates] [--plan] [--dry-run] [--json]`
- `clickityclank project delete <name> --yes [--plan] [--dry-run] [--json]`
- `clickityclank setup [--guild-id <id>] [--runtime openclaw|hermes] [--roles <csv>] [--repo-root <path>] [--dry-run] [--json]`
- `clickityclank hermes apply <name> [--dry-run] [--verify] [--restart] [--json]`
- `clickityclank project sync <name> [--maps-file <file>] [--create-missing-agents] [--delete-removed-channels] [--allow-rename] [--plan] [--dry-run] [--json]`
- `clickityclank project verify <name> [--json]`
- `clickityclank project repair <name> [--plan] [--dry-run] [--json]`
- `clickityclank project manifest from-request --request-file <file> [--output <file>] [--json]`
- `clickityclank project list [--json]`
- `clickityclank project show <name> [--json]`

---

## Hermes runtime

OpenClaw remains the default runtime. Select Hermes explicitly:

```bash
clickityclank project create linearstories \
  --runtime hermes \
  --guild-id 957153563694473286 \
  --repo /Users/developer/code/linearstories \
  --map frontend:frontend \
  --map backend:backend \
  --map qa:qa
```

Hermes mode still provisions the Discord category/channels, but it does **not** mutate `~/.openclaw/openclaw.json` or create per-channel OpenClaw workspaces. It writes:

- project context: `~/.clickityclank/projects/<project>/AGENTS.md` unless `--context-file` is supplied;
- routes source-of-truth: `~/.clickityclank/hermes/routes.json`;
- reviewable Hermes config fragment: `~/.clickityclank/hermes/hermes-config.fragment.yaml`.

The fragment uses existing Hermes Discord primitives: `discord.channel_prompts`, `discord.free_response_channels`, `discord.no_thread_channels`, and `discord.channel_skill_bindings`. It also emits `channel_routes` metadata for Hermes gateways that support pre-model-call runtime routing. Merge it into `~/.hermes/config.yaml` after review, then restart Hermes gateway.

For per-channel speed/reasoning trade-offs, see [Hermes Channel Runtime Modes](./docs/hermes-channel-modes.md).

To apply a generated Hermes fragment to live Hermes config after review:

```bash
clickityclank hermes apply linearstories --dry-run --json
clickityclank hermes apply linearstories --verify --json
```

The apply command backs up `~/.hermes/config.yaml`, merges only ClickityClank-managed Discord/Hermes route keys, runs `hermes config check`, and restores the backup if validation fails. Use `--restart` to receive safe restart instructions; the command does not blindly restart an active gateway process.

---

## Mapping semantics

`--map <channel>:<agentId>`

- left side (`channel`) = Discord channel name to create under the project category
- right side (`agentId`) = OpenClaw agent ID to route that channel to

Example:

- `--map frontend:frontend` → messages in `#frontend` route to `frontend`
- `--map backend:backend` → messages in `#backend` route to `backend`
- `--map qa:qa` → messages in `#qa` route to `qa`

---

## Mapping file example (YAML)

```yaml
project: sneakerscan
maps:
  - channel: frontend
    agentId: frontend
  - channel: backend
    agentId: backend
  - channel: qa
    agentId: qa
  - channel: mobiledev
    agentId: mobiledev
  - channel: infra
    agentId: infra
```

Run:

```bash
clickityclank project create sneakerscan \
  --guild-id 957153563694473286 \
  --maps-file ./sneakerscan.yaml
```

---

## Storage/layout

- Machine-global state: `~/.openclaw/clickityclank/state.json`
- OpenClaw config: `~/.openclaw/openclaw.json`
- Workspace convention: `~/.openclaw/workspace-<project>-<channel>`
- Template root: `~/.clickityclank/templates/roles/`
- Hermes project context: `~/.clickityclank/projects/<project>/AGENTS.md`
- Hermes routes/config fragments: `~/.clickityclank/hermes/`

---

## Safe operations

Always run with `--plan --dry-run` first for mutating commands.

Delete example:

```bash
clickityclank project delete linearstories --plan --dry-run
clickityclank project delete linearstories --yes
```