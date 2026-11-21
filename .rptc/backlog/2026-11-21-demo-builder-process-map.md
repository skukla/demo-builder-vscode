---
id: PL-122
kind: feature
area: platform
needs: []
value: med
status: backlog
---

# Demo Builder has a process map the pipeline checks

Filed 2026-11-21. The owner said yes (through the dev-pipeline thread) to giving Demo Builder a
process map: one file listing every piece of Demo Builder's development process (hooks, rule
suites, scans, release steps, periodic checks) by the moment it runs, what it reads and writes, and
who it tells. The pipeline's `process_map: <path>.json` setting points at it, and the pipeline's
checks then fail when the map and the files disagree, and report gaps (something written and never
read, a piece nothing reaches, two pieces doing one job).

The working example is the dev-pipeline repo's `docs/map/pieces.json` (rendered as
`docs/map/README.md`). Demo Builder's tooling registry (`tests/sop/toolingRegistry.ts`) and its 22
hook rules are the obvious first sources.

Start by asking the dev-pipeline thread for the map's shape; it offered to give it. Done when
`.pipeline.yaml` names the map, the `process_map` tool reports it current, and every gap it finds is
fixed or accepted with a reason.
