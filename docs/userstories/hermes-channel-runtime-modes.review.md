# rate-userstories review: Hermes channel runtime modes

Source: `docs/userstories/hermes-channel-runtime-modes.md`

Validation command:

```bash
linearstories import --context turtles --team "Stacking Turtles" --project clickityclank --dry-run docs/userstories/hermes-channel-runtime-modes.md
```

Result:

```text
Import Summary
  Total:   6
  Created: 0
  Updated: 0
  Skipped: 6
  Failed:  0
```

## 1. Summary Table

| Story | Score | Pass/Fail | Notes |
|-------|-------|-----------|-------|
| Named Hermes channel modes | 94% | PASS | Strong schema, enum validation, unknown-reference failure, and compatibility criteria. |
| Channel mapping selects or overrides mode | 92% | PASS | Clear resolution order and override semantics; could add one criterion for persisted manifest examples. |
| Emit channel route runtime policy | 95% | PASS | Excellent separation between prompt hints and pre-model-call runtime policy. Determinism and compatibility covered. |
| Hermes gateway applies route policy | 90% | PASS | Testable runtime expectations; dependency belongs partly in Hermes rather than ClickityClank, but no contradiction. |
| Defaults for fast, balanced, and deep | 87% | PASS | Documentation story is verifiable; could be stronger if it specifies exact built-in defaults or points to a canonical config table. |
| Safe rollout and verification | 96% | PASS | Strongest story: compatibility, validation, dry-run behaviour, config-fragment safety, and determinism covered. |

## 2. Contradictions

No hard contradictions found.

### Tensions

- **TENSION** — Stories 3 and 4 split responsibility across ClickityClank and Hermes gateway.
  - Story 3 requires ClickityClank to emit `channel_routes` metadata.
  - Story 4 requires Hermes gateway to consume and enforce that metadata before session construction.
  - Risk: ClickityClank support can land before Hermes gateway support, leaving route policy visible but not enforced. This is acceptable as a staged rollout because Story 6 requires the generated fragment to comment that `channel_routes` requires Hermes gateway support and that legacy Discord fields remain the compatibility path.

- **TENSION** — `fast`, `balanced`, and `deep` mode semantics are introduced as defaults in Story 5, while Stories 1 and 2 focus on generic mode machinery.
  - Risk: implementers may build custom mode support before agreeing exact built-in defaults.
  - This is not a contradiction. It suggests implementation should either define built-ins first or treat built-ins as docs/examples until defaults are committed in code.

## 3. Detailed Breakdown

No failed stories.

### Story: "As a project maintainer, I want named Hermes channel modes so that I can describe speed and reasoning trade-offs once per project" — Score: 94%

- **Specificity**: 29/30 — Field names, enum values, validation failures, and backward compatibility are explicit.
- **Testability**: 34/35 — Each criterion maps to parser/schema tests or route-generation assertions.
- **Completeness**: 22/25 — Covers schema and validation well. Could add exact fixture examples for `defaults.mode` plus `modes` interaction.
- **Description Quality**: 9/10 — Clear rationale and scope.

**Failure Reasons:** none.

**Minor Suggested Additions:**

- Add a fixture criterion such as: `A manifest with defaults.mode: fast and no map-level mode resolves every map to fast unless overridden.`

### Story: "As a project maintainer, I want each Discord channel mapping to select or override a Hermes runtime mode so that interactive channels can be cheaper and coding channels can be deeper" — Score: 92%

- **Specificity**: 28/30 — Resolution order and override semantics are precise.
- **Testability**: 34/35 — Criteria can be validated through route resolution tests and plan-output assertions.
- **Completeness**: 21/25 — Good core coverage. Could specify how unknown raw `model.default` values are treated: accepted pass-through vs validated against provider metadata.
- **Description Quality**: 9/10 — Strong examples of channel categories.

**Failure Reasons:** none.

**Minor Suggested Additions:**

- State whether `model.default` is treated as an opaque string or validated against known model/provider lists.
- Add a criterion that route resolution does not mutate the original parsed manifest object.

### Story: "As a Hermes operator, I want ClickityClank to emit channel route runtime policy so that Hermes can enforce model, reasoning, priority, and tool surface before the model call" — Score: 95%

- **Specificity**: 29/30 — Output paths, object names, key shape, required fields, and deterministic output are named.
- **Testability**: 35/35 — Highly testable with snapshot/fixture assertions.
- **Completeness**: 22/25 — Covers emitted state and compatibility. Could specify whether `channel_routes` sits top-level or under a `hermes`/`gateway` namespace if Hermes changes config conventions.
- **Description Quality**: 9/10 — Excellent explanation of why prompt text is insufficient.

**Failure Reasons:** none.

**Minor Suggested Additions:**

- Add a criterion confirming `channel_routes` keys use the same guild/channel IDs as existing `discord.channel_prompts` and `channel_skill_bindings` entries.

### Story: "As a Hermes gateway maintainer, I want Discord channel routes to apply runtime policy before session construction so that speed settings have real latency impact" — Score: 90%

- **Specificity**: 27/30 — Runtime behaviour is clear and field-level effects are named.
- **Testability**: 33/35 — Testable in Hermes gateway unit/integration tests; requires Hermes-side harness, not just ClickityClank tests.
- **Completeness**: 21/25 — Covers routed/unrouted behaviour, status visibility, and first-call tool schema impact. Could include precedence for manual overrides after session start.
- **Description Quality**: 9/10 — Strong statement of desired runtime impact.

**Failure Reasons:** none.

**Minor Suggested Additions:**

- Add a criterion defining precedence after session creation: e.g. `/model`, `/reasoning`, or `/fast` in the session override the route default until `/reset` or only for the current session.
- Add a criterion that route config changes require `/reset` or gateway restart, depending on Hermes implementation.

### Story: "As a ClickityClank user, I want clear defaults for fast, balanced, and deep Hermes channels so that I can use good speed/reasoning trade-offs without designing policy from scratch" — Score: 87%

- **Specificity**: 25/30 — Documentation checks are clear, but mode defaults are described conceptually rather than exact values.
- **Testability**: 31/35 — Verifiable by inspecting docs and examples.
- **Completeness**: 22/25 — Covers docs, examples, manual overrides, and pre-call selection caveat.
- **Description Quality**: 9/10 — Clear user benefit.

**Failure Reasons:** none.

**Minor Suggested Additions:**

- Define exact built-in defaults in the story or require a canonical table with fields for `priority`, `reasoning`, `model`, and `toolsets`.
- Add a criterion that generated sample manifests use the same defaults documented in the table.

### Story: "As a project maintainer, I want safe rollout and verification for Hermes channel modes so that existing ClickityClank projects are not broken" — Score: 96%

- **Specificity**: 30/30 — Explicit invalid cases, commands, files, and non-mutation guarantee.
- **Testability**: 35/35 — Directly maps to tests and CLI dry-run checks.
- **Completeness**: 22/25 — Excellent coverage. Could include versioning/migration for `routes.json` schema if schema shape changes.
- **Description Quality**: 9/10 — Clear rationale.

**Failure Reasons:** none.

**Minor Suggested Additions:**

- Add a criterion that `routes.json.schemaVersion` is bumped or consciously kept stable with a documented compatibility reason.

## 4. Replacement Markdown

No replacement markdown required. All six stories pass the 80% threshold and no hard contradictions were found.

## 5. Style Guide Recommendation

Not applicable. No UI or visual acceptance criteria were present.

## 6. Passing Stories

- **"Named Hermes channel modes"** — 94%. Strong schema and compatibility story.
- **"Channel mapping selects or overrides mode"** — 92%. Strong resolution semantics; add raw model validation policy if desired.
- **"Emit channel route runtime policy"** — 95%. Best architectural story; captures the real latency lever correctly.
- **"Hermes gateway applies route policy"** — 90%. Good but depends on Hermes-side implementation and tests.
- **"Defaults for fast, balanced, and deep"** — 87%. Passes; would benefit from exact defaults.
- **"Safe rollout and verification"** — 96%. Strongest QA/compatibility story.
