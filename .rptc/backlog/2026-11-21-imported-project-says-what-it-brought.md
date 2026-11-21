---
id: PL-119
kind: feature
area: platform
parent: PL-56d
needs: []
value: med
status: backlog
---

# An imported project says what it brought in, what it still needs, and whether its datapack can install

Filed 2026-11-21 from the backlog reconciliation. PL-56d listed three pieces as NOT done, and it
shipped without them:

- The banner "Brought in N settings from <file>; N need your input". No such text is in `src/`;
  `sourceDescription` reaches only a log line (`createProject.ts`, line 496).
- The list of credentials the new project still needs, in the wizard. No such list in
  `src/features/project-creation`.
- The datapack banner (decision D31): install it from the dashboard, it is not published, or it is
  already installed. None of those strings are in `src/`.

PL-56h covers naming the new repository and Adobe project, not these.

Done when an import shows all three, worded per D31.
