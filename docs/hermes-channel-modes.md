# Hermes Channel Runtime Modes

ClickityClank Hermes manifests can annotate Discord channels with runtime modes. Modes let a project trade off speed, reasoning depth, model choice, and tool surface per channel instead of using one global assistant profile everywhere.

## Built-in modes

ClickityClank ships three named defaults. They can be used directly or overridden in a manifest.

| Mode | Intended channels | Priority | Reasoning | Toolsets |
|------|-------------------|----------|-----------|----------|
| `fast` | `chat`, `triage`, `standup` | `fast` | `minimal` | `skills`, `memory`, `session_search`, `clarify` |
| `balanced` | normal project work | `normal` | `low` | `file`, `terminal`, `skills`, `memory`, `session_search`, `todo` |
| `deep` | coding, architecture, legal, security, incident debugging | `normal` | `high` | `file`, `terminal`, `web`, `delegation`, `skills`, `memory`, `session_search`, `todo` |

The model is intentionally unset in the built-ins. Hermes should use its configured default model unless the project manifest supplies a model policy.

## Manifest example

```yaml
project: clickityclank
runtime: hermes
repo: /Users/developer/code/clickityclank

defaults:
  mode: balanced

modes:
  fast:
    priority: fast
    reasoning: minimal
    model:
      provider: openrouter
      default: openai/gpt-4.1-mini
    toolsets: [skills, memory, session_search, clarify]

  deep:
    priority: normal
    reasoning: high
    model:
      provider: openai-codex
      default: gpt-5.5
    toolsets: [file, terminal, web, delegation, skills, memory, session_search, todo]

maps:
  - channel: chat
    agentId: assistant
    mode: fast

  - channel: backend
    agentId: backend
    mode: deep

  - channel: qa
    agentId: qa
    # Uses defaults.mode: balanced

  - channel: ops
    agentId: ops
    mode: deep
    reasoning: xhigh
```

## Override rules

The effective runtime policy for a channel is resolved in this order:

1. Map-level field overrides
2. Named mode field
3. `defaults.mode`
4. Built-in `balanced` fallback

`model` is merged field-by-field, so overriding `model.provider` preserves the mode's `model.default` unless explicitly overridden. `toolsets` are replaced, not merged, because a tool surface is a deliberate session boundary.

## Generated outputs

ClickityClank writes the resolved policy into two generated files:

- `~/.clickityclank/hermes/routes.json`
- `~/.clickityclank/hermes/hermes-config.fragment.yaml`

The config fragment contains:

- `channel_routes` — the pre-model-call route policy Hermes gateway should consume when supported
- legacy `discord.channel_prompts`, `discord.free_response_channels`, `discord.no_thread_channels`, and `discord.channel_skill_bindings` for current gateway compatibility

Prompt hints alone are not sufficient for latency reduction. Model, reasoning, priority, and toolsets must be selected before Hermes builds the model request, otherwise the heavy model and large tool schema have already been paid for.

## Manual session overrides

Hermes slash commands remain useful:

- `/fast`
- `/model`
- `/reasoning`

Treat them as manual session overrides. They do not replace declarative channel defaults in ClickityClank manifests.
