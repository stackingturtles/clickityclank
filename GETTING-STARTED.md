# Getting Started: ClickityClank + Discord

This guide walks you from zero to a working project/channel → agent mapping.

## Overview

You need two classes of Discord bots:

1. **Control-plane provisioning bot**
   - Used by `clickityclank` to create categories/channels
   - Token exported as `CLICKITYCLANK_DISCORD_TOKEN`

2. **Runtime role bots**
   - The actual bot identities that reply in mapped channels
   - Example: `frontend`, `backend`, `qa`

If you skip runtime role bots, channels may reply from the wrong existing bot identity.

---

## Step 1) Create Discord applications (Developer Portal)

Open: `https://discord.com/developers/applications`

Create these apps:
- `ClickityClank Admin` (provisioning bot)
- `Frontend`
- `Backend`
- `QA`

For each app:
1. Click **New Application**
2. Name it
3. Open app → **Bot** (left menu)
4. Click **Add Bot**
5. Copy bot token (you’ll use this later)

---

## Step 2) Set required bot permissions + invite bots

For each app, go to **OAuth2 → URL Generator**.

### Scopes
- `bot`

### Bot permissions
Minimum recommended:
- View Channels
- Read Message History
- Send Messages

For provisioning bot (`ClickityClank Admin`) also include:
- Manage Channels

Open generated URL and invite each bot to your target server.

---

## Step 3) Get your Discord Guild ID

In Discord app:
1. **User Settings → Advanced → Developer Mode = ON**
2. Right-click server icon
3. **Copy Server ID**

Save that value for `--guild-id`.

---

## Step 4) Configure OpenClaw runtime Discord accounts

In `~/.openclaw/openclaw.json`, ensure `channels.discord.accounts` includes runtime accounts matching your role agent IDs.

Example:

```json
{
  "channels": {
    "discord": {
      "accounts": {
        "frontend": { "name": "Frontend", "botToken": "DISCORD_TOKEN_FRONTEND" },
        "backend": { "name": "Backend", "botToken": "DISCORD_TOKEN_BACKEND" },
        "qa": { "name": "QA", "botToken": "DISCORD_TOKEN_QA" }
      }
    }
  }
}
```

Important naming rule:
- `accountId` must match agent id for auto-pinning (`frontend`, `backend`, `qa`).

Restart gateway after config edits:

```bash
openclaw gateway restart
```

---

## Step 5) Install and initialize clickityclank

```bash
git clone https://github.com/stackingturtles/clickityclank.git
cd clickityclank
bun install
bun run build
npm link
```

Initialize templates (example role set):

```bash
clickityclank init --roles frontend,backend,qa,mobiledev,pythonista,rustdev,soliditydev,infra
```

Templates are seeded under:
- `~/.clickityclank/templates/roles/<role>/AGENTS.md`
- `~/.clickityclank/templates/roles/<role>/SOUL.md`

---

## Step 6) Set provisioning token + verify doctor

Use the **ClickityClank Admin** bot token:

```bash
export CLICKITYCLANK_DISCORD_TOKEN='DISCORD_TOKEN_CLICKITYCLANK_ADMIN'
clickityclank doctor --json
```

You want Discord auth + OpenClaw config checks to pass.

---

## Step 7) Plan project creation first

```bash
clickityclank project create linearstories \
  --guild-id YOUR_GUILD_ID \
  --map frontend:frontend \
  --map backend:backend \
  --map qa:qa \
  --create-missing-agents \
  --plan --dry-run
```

Review plan output for:
- category/channels
- bindings
- workspace paths (`~/.openclaw/workspace-<project>-<channel>`)

---

## Step 8) Apply for real

```bash
clickityclank project create linearstories \
  --guild-id YOUR_GUILD_ID \
  --map frontend:frontend \
  --map backend:backend \
  --map qa:qa \
  --create-missing-agents
```

---

## Step 9) Verify mapping

```bash
clickityclank project show linearstories --json
```

Then test in Discord:
- `#frontend` should reply from Frontend bot
- `#backend` should reply from Backend bot
- `#qa` should reply from QA bot

---

## Common issues

### `ERROR Missing Permissions (50013)`
Provisioning bot lacks `Manage Channels` in server/category role permissions.

### No reply in mapped channel
Usually allowlist/policy issue. Confirm channel is allowed under `channels.discord.guilds.<guildId>.channels` and gateway restarted.

### Wrong bot identity replies
Runtime `accountId` doesn’t match mapped `agentId`, or old broad bindings still exist.

### `Unknown agent id`
Use `--create-missing-agents` or pre-create agents manually.
