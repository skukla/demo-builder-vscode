# Step 0: RPTC Re-initialization

**Purpose:** Re-establish RPTC workflow context before TDD execution begins.

**Prerequisites:** none.

## Tasks

- [ ] Re-invoke the originating command for this feature: `/rptc:feat experience-workspace-default-authoring` (or `/rptc:tdd "@.rptc/plans/experience-workspace-default-authoring/"`).
- [ ] Confirm working branch is cut from `develop` (e.g. `feature/experience-workspace-default-authoring`). Do NOT work on `master`.
- [ ] Confirm target release is the next release AFTER `1.0.0-beta.116` (do not bump to `.116`).
- [ ] Re-read `overview.md` and the source research `.rptc/research/experience-workspace-default-authoring/research.md` "Decisions locked" table.

## Acceptance Criteria

- Correct branch checked out from `develop`.
- Plan directory loaded; steps tracked via TaskCreate/TaskUpdate.
- No code changes in this step.
