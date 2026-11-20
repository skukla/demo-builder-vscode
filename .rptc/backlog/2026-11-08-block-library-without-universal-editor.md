---
id: EDS-71
kind: feature
area: eds
needs: []
value: high
status: planned
---

# The DA.live block library without Universal Editor's `component-definition.json`

Filed 2026-11-08 from the release walk's F67. Adobe retired Universal Editor with DA and deleted
`component-definition.json` from its Commerce templates; Demo Builder builds the DA.live block palette
from that file. Until this ships, the B2B patch pointer is held on a template that still has it
(`eds-demo-patches` `b2b/last-known-good.hold`).

Plan, owner sign-off pending: `.rptc/plans/block-library-without-universal-editor/overview.md`.
Research: `.rptc/research/ue-retirement-component-definition/research.md`.

## Shipped so far

- 2026-11-08  docs(rptc): walk findings F62 to F68, release tests 1.10 and 1.11, and the block library plan (`85f44f49c`)
