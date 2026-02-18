# clickityclank

CLI to provision Discord project/category/channel structure and wire OpenClaw bindings/workspaces.

## Install

```bash
bun install
bun run build
```

## Auth

Set provisioning token:

```bash
export CLICKITYCLANK_DISCORD_TOKEN=...
```

## Commands (MVP)

- `clickityclank init [--json]`
- `clickityclank doctor [--json]`
- `clickityclank project create <name> --guild-id <id> (--map <channel:agentId>... | --maps-file <file>) [--plan] [--dry-run]`
- `clickityclank project delete <name> --yes [--plan] [--dry-run]`
- `clickityclank project list`
- `clickityclank project show <name>`

## Examples

```bash
clickityclank project create linearstories \
  --guild-id 957153563694473286 \
  --map fe:hal --map be:infra --map qa:omikujidev --map handoff:hal --map release:candle \
  --plan

clickityclank project create sneakerscan --guild-id 123 --maps-file ./sneakerscan.yaml
```

### Mapping manifest (YAML)

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

## State + config

- State: `~/.openclaw/clickityclank/state.json`
- OpenClaw config: `~/.openclaw/openclaw.json`
- Project workspace path: `~/.openclaw/workspace-<project>`
