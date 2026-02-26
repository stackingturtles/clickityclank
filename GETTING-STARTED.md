# Getting Started: ClickityClank + Discord

This guide walks you from zero to a working project/channel → agent mapping.

## Overview

You need two classes of Discord bots:

1. **Control-plane provisioning bot**
   - Used by `clickityclank` to create categories/channels
   - Token exported as `CLICKITYCLANK_DISCORD_TOKEN`

2. **Runtime role bots**
   - The bot identities that reply in mapped channels
   - Example: `frontend`, `backend`, `qa`, `mobiledev`, `infra`

If you skip runtime role bots, channels may reply from the wrong identity.

---

## Step 1) Create Discord applications (Developer Portal)

Open: `https://discord.com/developers/applications`

Create these apps:
- `ClickityClank Admin` (provisioning bot)
- `Frontend`
- `Backend`
- `QA`
- `Mobiledev`
- `Infra`

For each app:
1. Click **New Application**
2. Name it
3. Open app → **Bot** (left menu)
4. Click **Add Bot**
5. Copy bot token (you’ll use this later)

---

## Step 2) Enable required intents (important)

For **each bot app**: **Bot → Privileged Gateway Intents**

Enable:
- ✅ **Message Content Intent**

Leave off unless you specifically need them:
- ⛔ Presence Intent
- ⛔ Server Members Intent

Without Message Content Intent, bots may not reliably read normal channel messages.

---

## Step 3) Set required bot permissions + invite bots

For each app, go to **OAuth2 → URL Generator**.

### Scopes
- `bot`

### Bot permissions
Minimum recommended for runtime bots:
- View Channels
- Read Message History
- Send Messages

For provisioning bot (`ClickityClank Admin`) also include:
- Manage Channels

Open generated URL and invite each bot to your target server.

---

## Step 4) Get your Discord Guild ID

In Discord app:
1. **User Settings → Advanced → Developer Mode = ON**
2. Right-click server icon
3. **Copy Server ID**

Save that value for `--guild-id`.

---

## Step 5) Configure OpenClaw runtime Discord accounts

In `~/.openclaw/openclaw.json`, ensure `channels.discord.accounts` includes runtime accounts matching your role agent IDs.

Example:

```json
{
  "channels": {
    "discord": {
      "accounts": {
        "frontend": { "name": "Frontend", "token": "DISCORD_TOKEN_FRONTEND" },
        "backend": { "name": "Backend", "token": "DISCORD_TOKEN_BACKEND" },
        "qa": { "name": "QA", "token": "DISCORD_TOKEN_QA" },
        "mobiledev": { "name": "Mobiledev", "token": "DISCORD_TOKEN_MOBILEDEV" },
        "infra": { "name": "Infra", "token": "DISCORD_TOKEN_INFRA" }
      }
    }
  }
}
```

Important routing rule:
- By default, `accountId` should match `agentId` for clean pinning (e.g. `frontend → frontend`).
- If you use `--project-scoped-agents`, clickityclank maps to project-specific agent IDs (e.g. `linearstories-frontend`) while reusing runtime account IDs (e.g. `frontend`).

Restart gateway after config edits:

```bash
openclaw gateway restart
```

---

## Step 6) Install and initialize clickityclank

```bash
git clone https://github.com/stackingturtles/clickityclank.git
cd clickityclank
bun install
bun run build
npm link
```

Initialize templates (example role set):

```bash
clickityclank init --roles frontend,backend,qa,mobiledev,infra
```

Templates are seeded under:
- `~/.clickityclank/templates/roles/<role>/AGENTS.md`
- `~/.clickityclank/templates/roles/<role>/SOUL.md`

---

## Step 7) Set provisioning token + verify doctor

Use the **ClickityClank Admin** bot token:

```bash
export CLICKITYCLANK_DISCORD_TOKEN='DISCORD_TOKEN_CLICKITYCLANK_ADMIN'
clickityclank doctor --json
```

You want Discord auth + OpenClaw config checks to pass.

---

## Step 8) Plan project creation first

```bash
clickityclank project create linearstories \
  --guild-id YOUR_GUILD_ID \
  --map frontend:frontend \
  --map backend:backend \
  --map qa:qa \
  --map mobiledev:mobiledev \
  --map infra:infra \
  --create-missing-agents \
  --project-scoped-agents \
  --plan --dry-run
```

Review plan output for:
- category/channels
- bindings
- workspace paths (`~/.openclaw/workspace-<project>-<channel>`)

New behavior (built-in):
- clickityclank now auto-manages Discord channel scopes in OpenClaw config:
  - global guild allowlist for mapped channels
  - per-account guild/channel scopes (when account mapping exists)
- this prevents cross-bot replies without manual config edits

---

## Step 9) Apply for real

```bash
clickityclank project create linearstories \
  --guild-id YOUR_GUILD_ID \
  --map frontend:frontend \
  --map backend:backend \
  --map qa:qa \
  --map mobiledev:mobiledev \
  --map infra:infra \
  --create-missing-agents \
  --project-scoped-agents
```

Restart after apply:

```bash
openclaw gateway restart
```

---

## Step 10) Verify mapping

```bash
clickityclank project show linearstories --json
```

Then test in Discord:
- `#frontend` should reply from Frontend bot only
- `#backend` should reply from Backend bot only
- `#qa` should reply from QA bot only
- `#mobiledev` should reply from Mobiledev bot only
- `#infra` should reply from Infra bot only

---

## Step 11) Sync + drift checks (recommended)

If channels/config drift over time (manual edits, deleted/recreated channels), run:

```bash
clickityclank project sync linearstories --create-missing-agents --plan --dry-run
clickityclank project sync linearstories --create-missing-agents
clickityclank doctor --json
```

Doctor now warns on:
- mapped agent/account mismatches
- binding exists but per-account channel scope missing
- global guild allowlist missing mapped channel

---

## Common issues

### `ERROR Missing Access (50001)`
The provisioning bot is not in the guild, wrong token is exported, or invited to the wrong server.

### `ERROR Missing Permissions (50013)`
Provisioning bot lacks `Manage Channels` in server/category role permissions.

### No reply in mapped channel
Usually allowlist/policy or Message Content Intent issue. Confirm:
- Message Content Intent is enabled for that bot app
- channel is allowlisted under Discord guild/channel config
- gateway restarted

### Wrong bot identity replies or all bots reply
Runtime `accountId` doesn’t match mapped `agentId`, old broad bindings exist, or account-level scoping is missing.

### `Unknown agent id`
Use `--create-missing-agents` or pre-create agents manually.
