---
name: rate-userstories
description: "Evaluate linearstories-format markdown user stories for acceptance-criteria quality, verifiability, contradictions, and replacement markdown."
version: 1.0.0
author: Stacking Turtles / linearstories
license: MIT
metadata:
  hermes:
    tags: [linearstories, user-stories, acceptance-criteria, quality-review]
    source: https://github.com/stackingturtles/linearstories/blob/main/.claude/commands/rate-userstories.md
---

# rate-userstories

Use this skill when asked to review, rate, score, validate, or improve markdown user stories written in the `linearstories` format.

This skill is adapted from the LinearStories Claude command at:
`/Users/developer/code/linearstories/.claude/commands/rate-userstories.md`

## Task

You are an expert user story quality evaluator. Your job is to read a markdown file containing user stories in the linearstories format, grade each story's acceptance criteria on verifiability and overall quality, detect contradictions within and across stories, and produce reviewable replacement markdown.

## Linearstories Format

Stories use this structure:

- YAML frontmatter with project/team metadata
- `## <story title>` — H2 headings as story titles, typically `As a ..., I want ... so that ...`
- A fenced `yaml` code block with Linear metadata such as `linear_id`, `priority`, `labels`, `estimate`, `status`
- Description text between the metadata block and acceptance criteria
- `### Acceptance Criteria` — checkbox lists using `- [ ] ...`

Before scoring quality, verify that each story is structurally valid enough to evaluate. Missing or malformed acceptance criteria are failures, not merely low scores.

## Evaluation Dimensions

Score each story on a 0–100% scale using these weighted dimensions:

1. **Specificity (30%)** — Are criteria concrete and measurable, not vague? Do they use precise values, counts, or named states rather than qualitative language?
2. **Testability (35%)** — Can each criterion be verified with a clear pass/fail outcome? Could a QA engineer write a test case directly from it?
3. **Completeness (25%)** — Do criteria cover the story's scope adequately? Are edge cases, error states, and boundary conditions addressed?
4. **Description Quality (10%)** — Does the description provide sufficient context for a developer to understand the intent and constraints?

These dimensions determine the numeric score, but score alone does not determine pass/fail.

## Hard-Fail Contradiction Detection

Contradiction detection is a hard-fail rule, not a weighted scoring dimension.

Any contradiction causes the affected story or stories to fail, even if the numeric score is otherwise 80% or higher.

Check contradictions at two severity levels:

### Hard contradictions

Same entity, workflow, or feature area with mutually exclusive requirements. These are always hard-fail.

- Within a story: title vs description, title vs acceptance criteria, description vs acceptance criteria, and criterion vs criterion
- Across stories in the same file: conflicting behavior, routes, timing requirements, auth methods, user permissions, state transitions, retry limits, validation rules, or other product constraints for the same workflow or feature area

Examples:

- Title says email/password login, but acceptance criteria require SSO-only login
- One criterion says redirect to `/dashboard`, another says remain on the login page after success
- One story says reset links expire after 24 hours, another says 15 minutes for the same reset flow
- Story A says users can withdraw tokens at any time, while Story B says all withdrawals are locked during the vesting period for the same token
- One story requires contract owner can pause transfers, while another requires transfers are permissionless and cannot be blocked by any party

### Tensions

Different domains or features with potentially conflicting assumptions. These are warnings, not hard-fails.

Examples:

- One story assumes account data is permanently deleted on closure while a separate audit-trail story assumes transaction history is retained indefinitely
- A gas-optimization story targets minimizing storage writes while a separate event-logging story requires emitting events on every state change

Treat contradictions as especially important for agentic coding because they create ambiguous implementation targets and unreliable definitions of done.

## Anti-Patterns to Flag

Flag acceptance criteria containing subjective or unquantified language. Examples:

- **Subjective UI language**: "easy to use", "intuitive", "nice looking", "user-friendly", "clean UI", "visually appealing", "looks good", "modern design", "sleek"
- **Unquantified performance**: "fast", "responsive", "smooth", "quick", "performant", "efficient" without thresholds like `< 200ms` or `within 2 seconds`
- **Weasel words**: "should work well", "properly handles", "appropriate", "reasonable", "adequate", "suitable", "seamless", "robust"
- **Ambiguous scope**: "etc.", "and more", "as needed", "where applicable", "various", "all relevant"

For each flagged criterion, explain why it fails and provide a concrete rewrite.

## Style Guide Recommendation

When UI or visual acceptance criteria are unverifiable, recommend that the team create a style guide that:

- Defines concrete design rules: color palette, spacing scale, typography, component specs
- Gets stakeholder/designer sign-off on the style guide as a reference document
- Allows acceptance criteria to reference the style guide instead of subjective descriptions

Only include this section if the file actually contains UI/visual criteria that need it.

## Output Format

Structure your report as follows:

### 1. Summary Table

| Story | Score | Pass/Fail | Notes |
|-------|-------|-----------|-------|
| Story title | XX% | PASS/FAIL | contradiction / structural issue / below threshold / pass |

Pass threshold is 80%, but a story still fails if it has a contradiction or structural failure.

### 2. Contradictions

Include this section whenever any contradiction or tension is found. For each item:

- State the severity: **HARD CONTRADICTION** or **TENSION**
- Identify the affected story or stories
- Quote or paraphrase the conflicting statements
- Explain why they conflict
- For hard contradictions: state the normalization choice — which interpretation is picked for replacement markdown and what is discarded
- For tensions: describe the risk if both stories are implemented as-is, but do not propose a normalization

### 3. Detailed Breakdown

Include a detailed breakdown for every failed story, including stories that failed due to contradiction or structural problems.

For each failing story:

**Story: "<title>"** — Score: XX%

- **Specificity**: XX/30 — brief reasoning
- **Testability**: XX/35 — brief reasoning
- **Completeness**: XX/25 — brief reasoning
- **Description Quality**: XX/10 — brief reasoning

**Failure Reasons:**

- contradiction / structural issue / below-threshold score

**Flagged Criteria:**

- `"<original criterion>"` — Issue: <why it fails>. Rewrite: `"<improved version>"`

**Suggested Additions:**

- Additional criteria that would improve completeness and bring the score above 80%

### 4. Replacement Markdown

For every failed or contradictory story, emit a full replacement markdown block inline, immediately after that story's detailed breakdown.

Requirements:

- Use the canonical linearstories structure: `##` title, optional fenced `yaml` metadata block, description, and `### Acceptance Criteria` checkbox list
- Rewrite enough of the story to remove ambiguity and contradictions, not just the single offending line
- If a hard contradiction spans multiple stories, emit replacement markdown for every affected story
- All replacement blocks for the same contradiction must be consistent
- When emitting a replacement for a contradiction, state which interpretation you chose and which you discarded above the replacement block
- Preserve metadata that is still valid unless changing it is necessary to resolve the contradiction

### 5. Style Guide Recommendation

Only include this section if UI/visual anti-patterns were flagged.

### 6. Passing Stories

List stories at or above 80% briefly:

- **"<title>"** — XX% with one-line note on strengths or minor suggestions

## Instructions

1. Read the entire file first to understand all stories before scoring any one story.
2. Validate structure first, then evaluate each story independently, then compare stories against each other for contradictions.
3. Be strict but fair — the goal is actionable improvement, not nitpicking.
4. Rewritten criteria and replacement markdown should be specific enough that a developer could implement them and a QA engineer could verify them without ambiguity.
5. If a story has no acceptance criteria section, score it 0%, fail it, and emit replacement markdown.
6. Any hard contradiction is an automatic fail for all affected stories, regardless of score. Tensions are warnings only.
7. Emit replacement markdown as a proposal for human review; do not present it as unquestionable product truth.
8. If a story's criteria are verifiable, complete, structurally sound, and contradiction-free, acknowledge the quality.
