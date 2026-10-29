---
id: PL-56f
kind: feature
area: platform
parent: PL-56
needs: [PL-56d]
value: med
status: built
---

# Agent tools for import and copy

Filed 2026-09-11. Today the agent can export (`export_project_settings`) and cannot import or
copy; `.rptc/backlog/2026-08-16-mcp-surface-for-sc-design-work.md:32` lists it as open
because the human import door opens a modal. Per `mcp-tool-authoring`: a path-taking
import action and a copy action, headless (no dialog on the happy path), the three
declarations, `.strict()` schemas from the handler payload types, registered in
`realSdkRegistration.test.ts`, `docs/systems/mcp-server.md` updated. The export tool loses
its `includeSecrets` flag with [[PL-56c]].

## Shipped so far

- 2026-10-03  Reconciled 2026-10-03 (second pass): the import half landed as create_project_from_file in 59a915952 (logged on PL-56d at the time); no copy tool yet.
- 2026-10-04  2026-10-04 night3-a (staged, not committed): staleness - the import half (create_project_from_file) existed, no copy tool; built copy_project: takes the source project's name, reads it through the human Copy's own seed (copySeedFromProject, so no credential and the source storefront only as provenance), and creates through create_project_from_file's shared second half (createFromProjectFile -> runProjectCreation); refuses naming the source's own repository or DA.live site; confirm:true-gated, no consent dialog (as create_project); registered, narrated, catalogued (158 tools), battery prompt copy-project, reversibility row (delete_project), coverage triage copyFromExisting; not yet taught in the generated AI files (owner decision).
- 2026-10-03  feat: pages ask before they publish; Copy reads the export; copy_project; true AI files (PL-56e, PL-56f, PL-56g, EDS-13f, AI-8) (`361bbe56f`)
