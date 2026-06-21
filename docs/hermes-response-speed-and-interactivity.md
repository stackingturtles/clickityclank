# Speeding Up Hermes Responses and Making Them Feel More Interactive

This note captures the practical knobs for making Hermes feel faster in Discord/CLI use, with a bias toward the ClickityClank/OpenClaw workflow: lots of project-local context, many tools, and occasional heavy coding or ops work.

## Executive Summary

Hermes latency usually comes from four places:

1. **Model latency** — the selected model is slow, overloaded, or doing deep reasoning.
2. **Prompt size** — too many tools, skills, memories, or long conversation history are sent every turn.
3. **Tool round-trips** — the agent has to inspect files, run commands, browse, or ask for approvals before answering.
4. **UX blocking** — long tasks are handled inline instead of being pushed into background work.

The best setup is not one universal profile. Use two modes:

- **Fast chat profile**: lightweight model, low reasoning, trimmed toolsets, short sessions.
- **Full work profile**: heavier model, full tools, project skills, careful reasoning.

That gives responsive back-and-forth without weakening the serious engineering workflow.

---

## 1. Use Fast Mode for Interactive Sessions

In Discord or gateway sessions:

```text
/fast
/reasoning low
```

For very simple chat, use:

```text
/reasoning minimal
```

Use higher reasoning only when the task genuinely needs it:

```text
/reasoning high
```

Good use of high reasoning:

- architecture decisions;
- legal/commercial drafting;
- multi-file code review;
- debugging subtle production issues;
- security-sensitive changes.

Poor use of high reasoning:

- quick questions;
- rewriting small snippets;
- checking a command;
- status updates;
- lightweight planning.

---

## 2. Pick a Fast Daily-Driver Model

The biggest single lever is the model. A heavyweight model may be excellent for code and reasoning but noticeably worse for conversational responsiveness.

Use the model picker:

```bash
hermes model
```

Or configure directly:

```bash
hermes config set model.provider <provider>
hermes config set model.default <model>
```

Recommended pattern:

- **Daily-driver / Discord chat**: fast, cheap, low-latency model.
- **Deep work**: larger model selected explicitly when needed.

The right answer depends on available providers, but the shape is what matters: do not run every casual Discord turn through the slowest model you have.

---

## 3. Trim Toolsets for Chat Profiles

Every enabled toolset adds schema/context overhead. That increases prompt size and slows responses, especially first-token latency.

Inspect and configure tools:

```bash
hermes tools
hermes tools list
```

For a fast chat profile, keep only the likely essentials:

- `file`
- `terminal`
- `web`
- `skills`
- `memory`
- `session_search` if cross-session recall matters

Disable heavyweight or rarely used toolsets unless this profile actually needs them:

- `browser`
- `image_gen`
- `video`
- `spotify`
- `homeassistant`
- `discord_admin`
- specialised SaaS/admin integrations

Tool changes require a new session:

```text
/reset
```

or restart the gateway if the platform config changed materially:

```bash
hermes gateway restart
```

---

## 4. Keep Sessions Short

Long sessions accumulate context. Eventually the model has to process a lot of history, and Hermes may also need compression. Both slow things down.

Use fresh sessions freely:

```text
/new
```

or:

```text
/reset
```

Rule of thumb:

- stay in one session for a coherent task;
- start a new session after a large research/coding/debugging run;
- do not use one forever-session as a general inbox.

Persistent memory and session search exist so short sessions do not mean losing the plot.

---

## 5. Push Slow Work into the Background

If a task will involve research, builds, tests, or multiple tool calls, it should not block the interactive chat unless the result is needed immediately.

Use:

```text
/background research X and report back
```

For scheduled/repeated work, use cron jobs rather than manually prompting:

```bash
hermes cron create 'every 2h'
```

For long shell commands inside an agent workflow, Hermes should run them as tracked background processes with completion notifications rather than blocking the whole conversation.

This changes the feel of the system: Hermes becomes less like a synchronous chatbot and more like an operations assistant that can keep working while you continue steering.

---

## 6. Reduce Approval Friction Carefully

Manual approvals can make Hermes feel slow if it has to stop before every low-risk command.

A good middle ground is smart approvals:

```bash
hermes config set approvals.mode smart
hermes gateway restart
```

Avoid globally disabling approvals unless you are comfortable with the risk:

```bash
hermes config set approvals.mode off
```

`smart` is the better default for a development machine: low-risk commands get out of the way, dangerous operations still require confirmation.

---

## 7. Use Two Hermes Profiles

This is the cleanest long-term setup.

Create a fast profile:

```bash
hermes profile create fast-chat --clone
hermes profile use fast-chat
hermes model
hermes tools
```

Then configure it for:

- fast model;
- minimal/low reasoning;
- trimmed toolsets;
- fewer always-on skills;
- Discord-friendly behaviour.

Keep the default/full profile for:

- ClickityClank implementation work;
- OpenClaw/Hermes development;
- deployments;
- legal/commercial drafting;
- tasks where correctness beats speed.

Suggested split:

| Profile | Purpose | Model | Tooling | Reasoning |
|---|---|---|---|---|
| `fast-chat` | quick Discord interaction | fast/cheap | minimal | minimal/low |
| `default` | real work | best available | full | low/high as needed |

This avoids the bad compromise where the assistant is either always too slow or too underpowered.

---

## 8. Make the UX More Interactive

Use steering/queueing rather than waiting silently.

In CLI sessions:

```text
/busy steer
```

or:

```text
/busy queue
```

In gateway/Discord sessions, the practical pattern is: keep sending corrections or extra context while Hermes is working. Hermes can receive mid-turn steering and incorporate it after tool boundaries.

Good interaction style:

```text
Do X.
Actually constrain it to Y.
If tests fail, don't refactor broadly; patch only the failing path.
```

This is better than waiting five minutes and then discovering the agent was solving the wrong version of the task.

---

## 9. Check Gateway Health When Discord Feels Slow

If Discord specifically feels sluggish, separate model latency from gateway problems.

Run:

```bash
hermes doctor
hermes status --all
```

Check gateway logs:

```bash
grep -i "error\|failed\|timeout" ~/.hermes/logs/gateway.log | tail -50
```

Restart after config changes:

```bash
hermes gateway restart
```

or from gateway chat:

```text
/restart
```

---

## Recommended Setup for ClickityClank Work

For this project, the best balance is:

1. Keep the main ClickityClank/OpenClaw profile capable and tool-rich.
2. Add a separate fast-chat profile for conversational Discord use.
3. Use `/fast` and `/reasoning low` in Discord by default.
4. Use `/background` for research/build/test tasks that do not need immediate synchronous output.
5. Start fresh sessions after large agent runs.
6. Keep project-local skills/docs for serious work, but do not load broad project context into every casual chat turn.

Concrete bootstrap:

```bash
hermes profile create fast-chat --clone
hermes profile use fast-chat
hermes model
hermes tools
hermes config set approvals.mode smart
hermes gateway restart
```

Then in Discord:

```text
/fast
/reasoning low
/reset
```

The result should be a Hermes that feels more responsive for normal conversation while preserving the heavier, more careful mode for actual ClickityClank engineering work.
