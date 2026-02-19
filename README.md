# clickityclank

Provision Discord Project→Agent routing and OpenClaw project-role agent workspaces with explicit mappings.

## What it does (MVP)

- Creates Discord categories/channels for a project
- Wires OpenClaw bindings using explicit channel→agent maps
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

clickityclank uses a **Discord control-plane bot token** for provisioning.

Set env var:

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
  --map fe:hal \
  --map be:infra \
  --map qa:omikujidev \
  --map handoff:hal \
  --map release:candle \
  --plan --dry-run
```

### 4) Apply for real

```bash
clickityclank project create linearstories \
  --guild-id 957153563694473286 \
  --map fe:hal \
  --map be:infra \
  --map qa:omikujidev \
  --map handoff:hal \
  --map release:candle
```

---

## Commands (MVP)

- `clickityclank init [--roles <csv>] [--json]`
- `clickityclank doctor [--json] [--discord-token <token>]`
- `clickityclank project create <name> --guild-id <id> (--map <channel:agentId>... | --maps-file <file>) [--create-missing-agents] [--overwrite-templates] [--plan] [--dry-run] [--json]`
- `clickityclank project delete <name> --yes [--plan] [--dry-run] [--json]`
- `clickityclank project list [--json]`
- `clickityclank project show <name> [--json]`

---

## Mapping semantics

`--map <channel>:<agentId>`

- left side (`channel`) = Discord channel name to create under the project category
- right side (`agentId`) = OpenClaw agent ID to route that channel to

Example:

- `--map fe:hal` → messages in `#fe` route to `hal`
- `--map qa:omikujidev` → messages in `#qa` route to `omikujidev`

---

## Mapping file example (YAML)

```yaml
project: sneakerscan
maps:
  - channel: fe
    agentId: hal
  - channel: be
    agentId: infra
  - channel: qa
    agentId: omikujidev
  - channel: handoff
    agentId: hal
  - channel: release
    agentId: candle
  - channel: mobile
    agentId: hal
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

---

## Safe operations

Always run with `--plan --dry-run` first for mutating commands.

Delete example:

```bash
clickityclank project delete linearstories --plan --dry-run
clickityclank project delete linearstories --yes
```