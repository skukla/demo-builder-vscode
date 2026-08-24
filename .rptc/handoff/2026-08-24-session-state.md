# Handoff — session state, 2026-08-24

Where everything stands at the end of a long day. Scoped to what a fresh session
needs to pick ANY thread back up; the Evaluation Mode build has its own handoff
(`2026-08-24-evaluation-mode.md`).

**develop:** `2e853e149` · full suite **14,815 / 1,132 suites green** · tsc,
typecheck:tests, eslint, blindspots clean · hygiene scan clean.
**Last release:** `v1.0.0-beta.141`.

## Needs the owner, not an agent

1. **Tell beta users to update and reload once.** beta.141 carries the manifest
   write-back migration; every project on a machine rewrites itself at startup.
   **No project resets** — that ask is wrong and the release notes say so.
2. **Confirm each user is on ≥ beta.141.** That confirmation *is* the gate for
   phase 2 of the migration (deleting the legacy readers). The group is small
   enough to name, which is why the two-release calendar wait was compressed to
   per-user confirmation.
3. **Request `claude plugin eval` early access.** Org-gated by an Anthropic
   contact. Ask specifically whether an MCP server can be evaluated by wrapping
   it as a plugin — today it targets plugins, not standalone servers.
4. **Verify the consent dialog live.** F5, then have an agent call any
   `confirm: true` tool. Shipped in beta.140, never watched with human eyes.

## Released in beta.141

Manifest write-back migration (phase 1) · the structural cleanup wave (feature
import cycles 15 → 1, ~35 dead files deleted, four longest functions decomposed)
· the legacy sweep.

## On develop, NOT released — 24 commits

**One is user-facing** and worth a release on its own timeline: the **PreToolUse
`aio`-global guard** in the generated bundle (`AI_CONTEXT_VERSION` **21**). Until
a release ships, no user's project has it.

Everything else is tooling, measurement and docs:
`scripts/trace-session.mjs` (+`scripts/trace/`) · `scripts/measure-ai-guidance.mjs`
· the `ai-coverage-scan` fix · the commit-backtick hook rule · the
Evaluation Mode plan, the research, and two backlog items.

**A release cut is the natural next step** — `cut-release` skill; it will offer
`codebase-sweep`, `dream` and the hygiene scan as pre-cut passes.

## Queued work, in the order I would take it

1. **Evaluation Mode** — plan and handoff ready, start at
   `.rptc/plans/evaluation-mode/step-01-dry-run-gate.md`.
2. **Agent round-trip optimisation** —
   `.rptc/backlog/2026-08-24-agent-round-trip-optimisation.md`. Four measured
   candidates. Independent of (1); candidate 1 (the self-inflicted
   `get_current_project` instruction) is the cheapest real win available.
3. **Manifest migration phase 2** — gated on owner action 2 above.
4. **Bodea storefront redesign** — sequenced behind better AI tooling by owner
   decision. The design is *not* done; the plan is archived but its banner says
   so plainly.

## Facts established today — do not re-derive

- **The round trip is the unit of cost, not the payload.** 2 calls and 4 calls
  cost the same (~47k); 9 cost 82k. Our whole surface (103 tool schemas + all
  generated guidance) is ~3,900 tokens against a ~20k floor that is Claude
  Code's, not ours.
- **Median task: 30,090 tokens, 6 calls** — identical across one session and
  2,520 tasks, so it is a real baseline.
- **Cache state swings the same prompt 6×** (55,236 cold / 8,959 warm). Any
  comparison that ignores it is noise.
- **`claude -p --output-format json`** returns `usage`, `modelUsage` with
  `costUSD`, `total_cost_usd`, `num_turns`, `duration_ms`, `permission_denials`
  — so a driven run needs no transcript parsing.
- **Response ceilings are WATCHED, not enforced.** `RESPONSE_CEILINGS` is
  imported in `tests/` only; nothing truncates at runtime. 21 of 103 tools are
  actually asserted against a payload.
- **Only 1 of 103 tools uses zod `.strict()`** — the other 102 silently drop
  unknown arguments.

## Branch hygiene (owner's call, nothing urgent)

- `origin/feature/llm-path-measurement` — **merged**, safe to delete remotely.
- `docs/mcp-surface-for-sc-design` + its worktree — **merged** into develop
  today; the worktree can go.
- `claude/commerce-connect-slice-1-plan-bgVlb` — ~1,350 commits behind, flagged
  earlier in the week and still undecided.
- `origin/claude/datapack-authoring-loop` — will need a rebase over the catalog
  move (`demo-packages.json` etc. now live in `features/components/config/`).
  Accepted cost at the time.

## Two habits worth keeping

- **Commit messages go through a heredoc**, not `-m "…"`. A hook now blocks
  backticks in a double-quoted `-m` — they were silently deleting words from
  pushed commits.
- **Prove a guard by running it.** Every hook and gate here is pinned by
  execution, because the one that was pinned by a string match did nothing on
  every EDS project ever generated.
