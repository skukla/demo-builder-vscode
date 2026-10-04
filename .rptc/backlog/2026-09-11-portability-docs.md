---
id: PL-56g
kind: chore
area: platform
parent: PL-56
needs: [PL-56d]
value: low
status: backlog
---

# A feature page for moving projects

Filed 2026-09-11. `docs/systems/` has one table row for `export_project_settings` and
nothing for Import from File, Copy from Existing or the file format. One page: what travels
and what does not (the contract's table), that credentials never travel and how the SC
supplies them, how a v1 file is read, the three doors and the agent tools, and the file's
name. Pinned by `cited-identifiers.test.ts` for every path and key it names.

## Shipped so far

- 2026-10-04  2026-10-04 night3-a (staged, not committed): staleness - project-file-format.md (2026-09-12) already covered the file, what travels, credentials and v1 reading, so the gap was the doors; wrote docs/systems/moving-projects.md (Export, Import from File, Copy from Existing, Edit; their agent tools; one writer and one reader; what travels and never does; credentials; older files; where it is pinned), linked from docs/README.md; every path and identifier it names was checked against the tree (cited-identifiers.test.ts only checks settings and npm scripts).
