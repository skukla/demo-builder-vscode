---
id: EDS-13e
kind: feature
area: eds
parent: EDS-13
needs: [EDS-13b]
value: low
status: superseded
superseded-by: EDS-13g
---

# Share a headless demo

Filed 2026-09-11 from the plan review. A Next.js storefront is a local clone with no
repository of the SC's own (`componentInstallation.ts:84` clones branch HEAD or a release
tag; `projectResetService.ts:437` re-clones on reset; nothing pushes). "Share this demo"
([[EDS-13b]]) therefore has nowhere to write the description file and is Edge Delivery
only in v1. Adding a headless demo already works: the colleague's repository is the source,
and reset re-clones it (the fork option was removed 2026-09-14, shareable-demo step 11).

This item is the other half: Share for a headless project creates a repository under the
SC's namespace, pushes the clone, writes `demo.demo-builder.json` there, and hands over the
link. The project then has a repository it did not have before, which reset and the update
check must learn to read. `low` because nothing waits on it and the how-to covers the manual
path.
