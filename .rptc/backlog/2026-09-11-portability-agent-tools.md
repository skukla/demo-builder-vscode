---
id: PL-56f
kind: feature
area: platform
parent: PL-56
needs: [PL-56d]
value: med
status: active
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
