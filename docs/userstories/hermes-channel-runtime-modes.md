---
project: "clickityclank"
team: "Stacking Turtles"
---

## As a project maintainer, I want named Hermes channel modes so that I can describe speed and reasoning trade-offs once per project

```yaml
linear_id: STA-455
linear_url: https://linear.app/stacking-turtles/issue/STA-455/as-a-project-maintainer-i-want-named-hermes-channel-modes-so-that-i
priority: 2
labels: [Feature, Hermes, Discord, User Story]
estimate: 3
status: Backlog
```

ClickityClank manifests need a project-level way to define reusable Hermes runtime policies. A maintainer should be able to define modes such as `fast`, `balanced`, and `deep`, then reference those modes from individual Discord channel mappings without repeating every runtime knob per channel.

### Acceptance Criteria

- [ ] A Hermes manifest may include a top-level `defaults.mode` string and a top-level `modes` object keyed by mode name.
- [ ] Each mode entry accepts `priority`, `reasoning`, `model.provider`, `model.default`, `toolsets`, and `maxTurns` fields.
- [ ] `priority` validation accepts only `normal` or `fast`.
- [ ] `reasoning` validation accepts only `none`, `minimal`, `low`, `medium`, `high`, or `xhigh`.
- [ ] `toolsets` validation rejects an empty array and rejects entries that are not non-empty strings.
- [ ] When a map entry references an unknown `mode`, ClickityClank exits non-zero and prints the unknown mode name and channel name.
- [ ] Existing manifests that omit `defaults` and `modes` continue to parse and produce the same route output as before.

## As a project maintainer, I want each Discord channel mapping to select or override a Hermes runtime mode so that interactive channels can be cheaper and coding channels can be deeper

```yaml
linear_id: STA-456
linear_url: https://linear.app/stacking-turtles/issue/STA-456/as-a-project-maintainer-i-want-each-discord-channel-mapping-to-select
priority: 2
labels: [Feature, Hermes, Discord, User Story]
estimate: 5
status: Backlog
```

Individual channel mappings should be able to opt into a named mode and override specific runtime fields. This allows channels like `chat` or `triage` to use low-latency settings while channels like `backend`, `architecture`, or `legal` use stronger reasoning and broader tools.

### Acceptance Criteria

- [ ] `MapEntry` accepts optional `mode`, `reasoning`, `priority`, `model`, `toolsets`, and `maxTurns` fields for Hermes runtime projects.
- [ ] The effective runtime policy for a channel is resolved in this order: map-level field override, then named mode field, then `defaults.mode`, then ClickityClank's built-in `balanced` fallback.
- [ ] A map-level override of `model.provider` preserves the named mode's `model.default` unless `model.default` is also overridden.
- [ ] A map-level override of `toolsets` replaces the named mode's `toolsets` array rather than merging it.
- [ ] The resolved route for each channel records both the selected `mode` name and the fully resolved runtime policy.
- [ ] The `--plan` output for Hermes projects includes each channel's selected mode and effective model name.
- [ ] Unit tests cover at least one channel using a named mode, one channel using `defaults.mode`, and one channel overriding a single runtime field.

## As a Hermes operator, I want ClickityClank to emit channel route runtime policy so that Hermes can enforce model, reasoning, priority, and tool surface before the model call

```yaml
linear_id: STA-457
linear_url: https://linear.app/stacking-turtles/issue/STA-457/as-a-hermes-operator-i-want-clickityclank-to-emit-channel-route
priority: 2
labels: [Feature, Hermes, Discord, User Story]
estimate: 5
status: Backlog
```

Prompt text alone does not reduce latency because the heavy model and tool schemas have already been selected. ClickityClank should write route metadata that Hermes can consume before constructing a session or model request.

### Acceptance Criteria

- [ ] `~/.clickityclank/hermes/routes.json` stores `mode` and `runtime` for each route when the project runtime is `hermes`.
- [ ] Each `runtime` object may contain `priority`, `reasoning`, `model`, `toolsets`, and `maxTurns`.
- [ ] The generated Hermes config fragment includes a `channel_routes` object keyed by `discord:<guildId>:<channelId>`.
- [ ] Each `channel_routes` entry includes `project`, `channel`, `profile`, `workdir`, `context_file`, `skills`, `mode`, and the resolved runtime policy.
- [ ] Existing `discord.channel_prompts`, `discord.free_response_channels`, `discord.no_thread_channels`, and `discord.channel_skill_bindings` output remains present for backward compatibility.
- [ ] Generated YAML is deterministic: route keys are sorted lexicographically and repeated generation with unchanged input produces byte-identical output.
- [ ] Tests assert that a `fast` channel emits `priority: fast`, `reasoning: minimal`, and a reduced `toolsets` list in both `routes.json` and the config fragment.

## As a Hermes gateway maintainer, I want Discord channel routes to apply runtime policy before session construction so that speed settings have real latency impact

```yaml
linear_id: STA-458
linear_url: https://linear.app/stacking-turtles/issue/STA-458/as-a-hermes-gateway-maintainer-i-want-discord-channel-routes-to-apply
priority: 2
labels: [Feature, Hermes, Gateway, User Story]
estimate: 8
status: Backlog
```

Hermes should consume the route metadata emitted by ClickityClank and apply it when a Discord message starts or resumes a session. The selected channel policy must affect the provider, model, reasoning level, toolsets, priority queue handling, workdir, context file, and skills before the first model request for that turn.

### Acceptance Criteria

- [ ] For each Discord message, Hermes computes a route key in the form `discord:<guildId>:<channelId>` before resolving session options.
- [ ] If a matching `channel_routes` entry exists, Hermes applies its `model.provider`, `model.default`, `reasoning`, `toolsets`, `priority`, `workdir`, `context_file`, and `skills` before building the model request.
- [ ] If no matching route exists, Hermes uses the existing platform and global defaults without changing current behaviour.
- [ ] A route-level `priority: fast` starts the session with the same priority-processing behaviour as sending `/fast` before the first user message.
- [ ] Route-level toolsets replace the platform's default enabled toolsets for that session and are visible in the generated tool schema count for the first model call.
- [ ] Route-level model settings are reflected in the runtime metadata returned by `/status` for that Discord session.
- [ ] Tests cover routed and unrouted Discord messages and verify that unrouted messages preserve current default behaviour.

## As a ClickityClank user, I want clear defaults for fast, balanced, and deep Hermes channels so that I can use good speed/reasoning trade-offs without designing policy from scratch

```yaml
linear_id: STA-459
linear_url: https://linear.app/stacking-turtles/issue/STA-459/as-a-clickityclank-user-i-want-clear-defaults-for-fast-balanced-and
priority: 3
labels: [Feature, Hermes, Documentation, User Story]
estimate: 3
status: Backlog
```

ClickityClank should ship opinionated runtime mode defaults that match common project-channel patterns. Users can override them, but the default generated manifests and docs should make the intended trade-offs explicit.

### Acceptance Criteria

- [ ] Documentation defines the built-in `fast`, `balanced`, and `deep` mode profiles with their default `priority`, `reasoning`, and intended tool surface.
- [ ] Documentation recommends `fast` for `chat`, `triage`, and `standup` channels; `balanced` for normal project work; and `deep` for coding, architecture, legal, security, and incident-debugging channels.
- [ ] The example Hermes manifest shows at least one `fast` channel and one `deep` channel in the same project.
- [ ] The docs state that `/fast`, `/model`, and `/reasoning` remain manual session overrides and do not replace declarative channel defaults.
- [ ] The docs state that prompt hints alone are not sufficient for latency reduction because model and tool selection must happen before the model call.
- [ ] The README's Hermes runtime section links to the new channel modes documentation.

## As a project maintainer, I want safe rollout and verification for Hermes channel modes so that existing ClickityClank projects are not broken

```yaml
linear_id: STA-460
linear_url: https://linear.app/stacking-turtles/issue/STA-460/as-a-project-maintainer-i-want-safe-rollout-and-verification-for
priority: 2
labels: [Feature, Hermes, QA, User Story]
estimate: 5
status: Backlog
```

The feature changes route generation and config output, so it needs explicit compatibility checks, dry-run visibility, and tests around existing behaviour.

### Acceptance Criteria

- [ ] Existing unit tests for Hermes route generation pass without changing expected output for manifests that do not specify modes.
- [ ] New tests cover invalid mode references, invalid reasoning values, invalid priority values, and empty `toolsets` arrays.
- [ ] `clickityclank project create --runtime hermes --plan` displays the generated route policies without creating Discord channels or writing state.
- [ ] `clickityclank project sync --runtime hermes --dry-run` validates mode configuration and reports all validation errors before writing `routes.json` or the config fragment.
- [ ] The generated config fragment includes a comment that `channel_routes` requires Hermes gateway support and that the legacy Discord fields remain the compatibility path.
- [ ] The implementation does not mutate `~/.hermes/config.yaml`; it only writes the reviewable fragment under `~/.clickityclank/hermes/hermes-config.fragment.yaml`.
- [ ] A test fixture proves that running route generation twice with the same input produces identical `routes.json` and config-fragment content.
