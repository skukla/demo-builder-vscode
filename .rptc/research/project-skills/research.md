# Project-Specific Skills: Candidates + Design Learnings

**Date**: 2026-07-03
**Inputs**: (a) codebase/documentation scan for skill candidates (sources: `.rptc/sop/`,
`docs/patterns|systems|development/`, all CLAUDE.md files, project memory, last 60 commits,
120 `.rptc/complete/` entries); (b) two YouTube reviews — "Ultimate Guide To Claude Skills"
(`wc54-e6Dt68`) and "Stop Prompting Claude. Use Karpathy's Method Instead." (`7zZy1QTvokM`);
(c) the official-docs skills research from the 2026-07-03 DX audit (`../dx-audit/research.md`).

---

## 1. Learnings from the videos, applied to OUR skills

### From "Karpathy's Method" (spec → verifier → environment)

**L1 — Every procedural skill must end with a verification step that pulls EXTERNAL signal.**
The video's strongest point (echoing Boris Cherny: "if Claude has a feedback loop, it will
2–3× quality"): don't let the agent assert success — make it probe reality. For us that means
each skill body ends with a "Verify" section using a real probe:
- `adobe-org-context` → `aio console org list` vs config org; the token is the truth.
- `eds-external-services` → curl the published page / check config with the *reading* API,
  not the writing one (the failure modes are silent — probes are the only defense).
- `webview-command-handler` → the handler smoke test (message round-trip), not "code compiles".

**L2 — Three-tier guardrails: always-do (prose) / ask-first (in-skill checkpoint) / never-do (hook).**
Prose rules are requests; hooks are rules. We already applied this (jest-pipe guard). For skills:
destructive steps inside a skill body get an explicit **ask-first checkpoint** (e.g., any delete
flow: "show the user what will be deleted and wait for approval"), and anything that must NEVER
happen belongs in a PreToolUse hook, not in the skill text.

**L3 — CLAUDE.md is the router; skills are the handbook.** His CLAUDE.md lists which skills
exist and how they're routed. Ours already points to `gate`/`cut-release`; when the new skills
land, the root CLAUDE.md gets one line per skill family, not the content.

**L4 — "Run water through it": skills are living documents.** The improvement loop is
use → leak → fix. Convention to adopt: when a skill misleads or is missing a case discovered
mid-session, updating the skill is part of finishing the task (same discipline as memory
corrections). Add a standing line to each skill's footer: "If this skill was wrong or
incomplete, fix it before closing the task."

**L5 — Spec discipline maps to skill authoring.** Interview-first, small compartmentalized
scope, verify key decisions explicitly. Authoring implication: derive each skill from the real
incident sources (memories, ADRs, commit history — which the candidate scan already did), and
keep each scoped to ONE task shape (see L6).

### From "Ultimate Guide To Claude Skills"

**L6 — One skill per distinct task shape, not per topic.** He builds separate skills for
email vs newsletter vs script rather than one "writing" skill — matching the official guidance
that auto-invocation quality depends on a tight description. Implication: **split the broad
`eds-external-services` candidate** into `eds-publish-and-config` (Helix/DA.live/Config Service
auth+scoping) and `eds-dropin-vendoring` (import map / `__dropins__` / b2b feature-pack) —
they trigger on different phrases and are needed in different sessions.

**L7 — Skills can bundle assets, not just prose.** (His: brand kit + example slide + logo.)
Ours: `wizard-step-authoring` ships a step-skeleton file; `adobe-org-context` ships the spike's
probe script (`aio console org list` wrapper); `webview-command-handler` ships a handler
template matching `defineHandlers`.

**L8 — Trim ruthlessly; long instructions "do more than they need."** Reinforces the official
per-skill compaction budget (~5k tokens) and our audit's lesson. Target ≤150 lines per skill
body; push detail into bundled reference files (loaded only when the agent opens them).

**L9 — Vet third-party skills; build your own from your own examples.** Already our policy
(both Kun Chen's benchmark evidence and this video agree). All 10 candidates are home-grown
from real incident history — keep it that way.

---

## 2. Candidates (from the codebase scan, ranked frequency × error-proneness)

| Rank | Skill | Sources to distill | Evidence | Video-informed shape |
|---|---|---|---|---|
| 1 | `adobe-org-context` | memory `reference_canonical_org_context`, `src/commands/CLAUDE.md` auth pre-flight, `ensureOrgContext.ts` / `detectProjectOrgMismatch.ts` | ~10/60 recent commits are org-threading fixes | Verify: token-org probe (L1). Never-do: no org pickers, no `aio console org select` mutations (L2) |
| 2a | `eds-publish-and-config` | memories: helix-delete-auth, dalive-config-scope, canvas-doc-path, config-service-key, aemlive-path-encoding, catalog-sku-case; ADRs 002/005/007 | 8 load-bearing memories; silent failure modes | Split per L6. Verify: read-back probes (L1) |
| 2b | `eds-dropin-vendoring` | memories: eds-dropin-delivery, b2b-config-flags; ADR 009/010; backlog b2b item | every storefront feature-pack op | Split per L6 |
| 3 | `webview-command-handler` | `src/commands/CLAUDE.md` §BaseWebviewCommand, `src/core/CLAUDE.md` patterns, `docs/systems/race-conditions.md`, `.rptc/sop/consistency-patterns.md` §1-2 | ≥6 completed race/handshake fixes | Bundle handler template (L7). Verify: message round-trip (L1) |
| 4 | `wizard-step-authoring` | root CLAUDE.md wizard block, `docs/patterns/selection-pattern.md`, memory project_builder_nested_design | ~30/60 recent commits | Bundle step skeleton (L7); also de-bloats root CLAUDE.md |
| 5 | `spectrum-webview-ui` | memories: dimension-prop-scale, menu-sections, dashboard-conventions; `docs/development/styling-guide.md` + `ui-patterns.md` | constant UI work | Gotcha-cluster reference; keep ≤150 lines (L8) |
| 6 | `decompose-god-file` | `.rptc/sop/god-file-decomposition.md` (already skill-shaped) + extraction checklists | 12+ completed SOP-remediation items | Cheapest to build |
| 7 | `worktree-setup` | memories: worktree-location, worktree-claude-config, preview-loop | every branch | Small; folds preview-loop in |
| 8 | `add-mcp-tool` | `docs/systems/mcp-server.md` §8/10/13-14 | growing surface | Defer or build thin |
| 9 | `add-prerequisite` | `docs/systems/prerequisites-system.md` dev guide | recurrence slowing | **Defer** (backlog prereqs reframe pending) |
| 10 | `jest-debugging` | MEMORY.md gotchas, sop testing-guide | declining post-hooks | **Don't build** — merge remnants into `gate` |

**Merge-into-existing (not new skills):** whole-repo-lint / match-CI mode → `gate`;
release-process memory → verify `cut-release` covers it, then prune the memory.

## 3. Structural decision required first

`.claude/` is **gitignored** (per-developer). Project skills there don't reach worktrees
(copy step required) or any other contributor, and aren't versioned. Options:
1. **Un-ignore `.claude/skills/` only** (keep settings/hooks local) — skills become tracked,
   reviewed, shared; matches "skills are living documents" (L4). Recommended.
2. Keep gitignored + rely on the worktree-copy step (status quo; solo-dev acceptable).

## 4. Proposed skill template (synthesis)

```
---
name: <task-shaped-name>
description: <what + WHEN, trigger phrases first, ≤2 sentences>
---
# <Task>
## When NOT to use          (1 line — routes to sibling skill if wrong match)
## Procedure                (numbered, tight; ask-first checkpoints on destructive steps)
## Gotchas                  (the incident-derived facts, each 1-3 lines)
## Verify                   (external-signal probe — never assert success)
<footer: "If this skill was wrong or incomplete, fix it before closing the task.">
```
Target ≤150 lines; bundle templates/probe scripts as sibling files.

## 5. Addendum: Loop engineering (reviewed 2026-07-03, `YAS4ojuhbW4`)

"Stop Prompting Claude. Start Loop Engineering." (same author; quotes Boris Cherny). Core:
a loop = goal + verification re-prompting until done. **Four-condition test** for loop
candidacy: repeats · clear definition of done · token budget affordable · the loop has tools
to verify. **Four blocks**: trigger (`/loop` local, `/schedule` cloud, or a loop-orchestration
skill) · execution skills · goal+verification (bridge abstract→verifiable via reviewer skills
emitting approved/score; verify with a SEPARATE agent) · output+memory (loops must write run
history/lessons or they repeat mistakes).

**Assessment for this project — mostly validation, two real candidates:**
- The prerequisite is exactly what we just built: "skill-driven loop development — never build
  a loop without battle-tested skills." Our batch-1 skills carry external-signal Verify
  sections, which is what makes a skill loop-compatible. No changes needed to them.
- We already own the primitives: harness `/loop` + `/schedule`, and `rptc:verify-loop` IS a
  loop (review agents until 0 findings). No new machinery required.
- **Loop candidate 1 — `babysit-pr`**: after pushing a PR, poll `gh pr checks` until green,
  fixing failures (whole-repo lint + test-file-size cap have both bitten on PRs). Passes all
  four conditions. Build as a loop-orchestration skill once the gate skill's evidence-capture
  lands.
- **Loop candidate 2 — SOP-cleanup burn-down**: backlog `2026-06-10-sop-pre-existing-patterns`
  is verifiable (`/sop-scan` findings → 0), repetitive, tool-complete: "scan → fix top finding
  → gate → repeat" with an iteration cap.
- **Adopt "loop training mode"**: any new loop pauses at each step for approval until proven,
  then the checkpoint is removed — same discipline as our ask-first checkpoints, applied to
  autonomy. And per the video's own rule (battle-tested skills first), loops wait until
  batch-1 skills have survived real use.

## 6. Suggested build order

1. Decide §3 (gitignore). 2. Build rank 1–4 (one commit each, testable by invoking on a real
task). 3. Fold merge-items into `gate`/`cut-release`. 4. Prune the memories whose content
moved into skills (promotion path per the DX audit). 5. Add the one-line skill router entries
to root CLAUDE.md. Ranks 5–7 as a second batch; 8–10 deferred per table.
