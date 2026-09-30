---
id: EDS-21
kind: feature
area: eds
needs: []
value: med
status: backlog
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
