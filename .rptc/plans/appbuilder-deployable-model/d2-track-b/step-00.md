# Step 00 — RPTC re-initialization

**Purpose:** Re-establish RPTC context for the D2 Track B TDD run. This is the standard
RPTC re-init step; it runs FIRST every time, regardless of plan size.

## Tasks

- [ ] Re-invoke the originating `/rptc:feat` (or `/rptc:fix`) command for D2 Track B so the TDD
      executor loads the workflow context, skills, and SOPs.
- [ ] Confirm the working tree is the Track B worktree
      (`demo-builder-vscode.worktrees/feature/appbuilder-deployable-model-d2b`) on
      `develop` (D1 + Track A merged — commits `220c0a0f` Track A, `1c900931`/`71a5ccf8` D1).
- [ ] Verify `.claude/` config is present in this worktree (settings/skills/permissions are per-checkout
      and gitignored — see project memory "Worktree .claude Config Gotcha"). Copy from the main checkout
      if missing.
- [ ] Read the D2 research doc (`.rptc/research/appbuilder-deployable-model/d2-research.md`, esp.
      sections B, B.2, C, E), the D1 spike findings' 3-bucket "what the user provides" rule
      (`d1-spike-findings.md:406-432`), and this plan's "D2 Track B" section in `overview.md` before any
      RED test.
- [ ] Confirm the full suite is GREEN at baseline:
      `npm run lint && npx tsc --noEmit && npx jest --no-coverage`
      (CI lints the WHOLE repo — a scoped lint hides repo-wide errors; see overview "CI gate").

## Acceptance criteria

- RPTC context re-initialized; worktree + branch + `.claude/` confirmed; baseline suite GREEN before
  Step 01's first RED test.
