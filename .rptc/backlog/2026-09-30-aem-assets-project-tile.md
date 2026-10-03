---
id: EDS-21
kind: feature
area: eds
needs: []
value: med
status: built
---

# A project tile that opens AEM Assets

Filed 2026-09-30 (owner request, mid-session). A dashboard tile the SC can click to
open AEM Assets for the project — the DAM where the storefront's images live.

## What

Add a tile to the project dashboard that opens the project's AEM Assets UI in the
browser, alongside the existing open-X tiles (storefront, Commerce admin, etc.).

## What already exists to build on

The AEM author binding is already configured: `demoBuilder.daLive.aemAuthorUrl` (a bare
host) drives the existing Assets panel — see memory [[reference_aem_assets_binding]] (the
real AEM for the current setup is the p158206-e1694619 author). So the tile does not need
new auth or config; it derives the Assets URL from that setting and opens it.

## Recommended approach

- A dashboard tile mirroring the existing "open …" tiles (reuse the tile component and the
  open-url path; see `reuse-first`). Its href is the AEM Assets URL derived from
  `demoBuilder.daLive.aemAuthorUrl`.
- Hide/disable the tile when the setting is unset (no AEM author configured) rather than
  opening a broken URL.
- **Hit every surface:** if a person gets this via a button, an agent should get it too —
  add the MCP tool counterpart (an `open_*`-style tool) so the agent surface matches
  (`ai-coverage-scan`). And confirm which of the eight webview bundles renders the dashboard
  tile.

## Open question (product)

Does "AEM Assets" mean the Assets console of the bound AEM author, or a project/folder
scoped view within it? Confirm the exact destination URL shape before building — opening
the generic Assets console vs a project-scoped folder is a real difference to the SC.

## Verification

Tile renders on the dashboard when `aemAuthorUrl` is set, absent when not; clicking opens
the correct AEM Assets URL; MCP tool returns/opens the same URL; a test pins the URL
derivation from the setting.

## Shipped so far

- 2026-09-30  Shipped on loop/2026-09-30-erp-programme (64d3aa7fd): More menu 'AEM Assets' opens https://<demoBuilder.daLive.aemAuthorUrl>/assets.html/content/dam; unset setting → notification offering the setting. Agent surface: get_project_urls reports aemAssets, open_url accepts target aemAssets. Gate: dashboard + server suites (168), sop (58), tsc, typecheck:tests, npm run lint all green. Not yet live-probed — the running host serves the feature/erp-integration worktree build.
- 2026-10-03  Reconciled 2026-10-03 (second pass): the logged 64d3aa7fd is on no branch (rebased away); the real commit is 7a773be4e, on feature/erp-integration, not develop.
