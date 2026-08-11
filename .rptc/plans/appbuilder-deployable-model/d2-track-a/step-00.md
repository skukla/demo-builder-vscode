# Step 00 — RPTC re-initialization

**Purpose:** Re-establish RPTC context for the D2 Track A TDD run. This is the standard
RPTC re-init step; it runs FIRST every time, regardless of plan size.

## Tasks

- [ ] Re-invoke the originating `/rptc:feat` (or `/rptc:fix`) command for D2 Track A so the TDD
      executor loads the workflow context, skills, and SOPs.
- [ ] Confirm the working tree is the D2 worktree
      (`demo-builder-vscode.worktrees/feature/appbuilder-deployable-model-d2`) on
      `feature/appbuilder-deployable-model-d2` (develop + merged D1, commit `18d5e878`).
- [ ] Verify `.claude/` config is present in this worktree (settings/skills/permissions are per-checkout
      and gitignored — see project memory "Worktree .claude Config Gotcha"). Copy from the main checkout
      if missing.
- [ ] Read the D2 research doc
      (`.rptc/research/appbuilder-deployable-model/d2-research.md`) and this Track-A plan's
      `overview.md` "D2 Track A" section before any RED test.
- [ ] Confirm the full suite is GREEN at baseline: `npm run lint && npx tsc --noEmit && npx jest --no-coverage`
      (CI lints the WHOLE repo — a scoped lint hides repo-wide errors; see overview "CI gate").

## Acceptance criteria

- RPTC context re-initialized; worktree + branch + `.claude/` confirmed; baseline suite GREEN before
  Step 01's first RED test.
