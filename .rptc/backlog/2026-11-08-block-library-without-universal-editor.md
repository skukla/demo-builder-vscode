---
id: EDS-71
kind: feature
area: eds
needs: []
value: high
status: planned
plan: block-library-without-universal-editor
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
- 2026-11-21  Reconciled 2026-11-21: planned; waits on the owner's sign-off of .rptc/plans/block-library-without-universal-editor/overview.md. The palette is still built from component-definition.json.
- 2026-11-23  fix(updates): a template update keeps the three Universal Editor files when the template deletes them, stops by name on another deleted file the storefront changed, and quotes names safely in bash and cmd.exe (6f8737de1, merged to develop 0163f55ae). Checked reset the same day: both resets rebuild B2B storefronts from the held f8eb94d, which still has the files (read live: present at f8eb94d, 404 at Adobe's HEAD), so they keep them while the hold stands; nothing in either reset keeps them once it lifts, which this plan covers. The palette is built from the storefront's own copy at creation and reset, because every storefront gets Demo Builder Blocks (`0da6649cc`, beta.152), so no storefront reads Adobe's HEAD for it today.
