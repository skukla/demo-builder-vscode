---
id: PL-67
kind: fix
area: platform
needs: []
value: med
status: backlog
parent: PL-11
---

# Six enforcer suites cannot see a file git does not track

Filed 2026-10-03 from PL-11 ("recorded, not worked"). Several tests/sop enforcers list files
through git, so a new file is invisible to them until it is committed: an agent working in a
worktree has to `git add` before the gate for those checks to read it (seen repeatedly in the
2026-10-03 overnight loop). Either the enforcers read the working tree, or the gate stages
nothing and says which checks only see tracked files. Measure which six first.

## Shipped so far

- 2026-10-03  Built 2026-10-03: measured 16 suites reading tracked files only (not six); all now list through architectureScan.workingTreeFiles (tracked plus untracked-not-ignored, existing on disk) or git grep --untracked, each proven by a planted untracked file that the old listing missed and the suite now fails on; tooling-registry stays tracked-only by its own stated reason.
