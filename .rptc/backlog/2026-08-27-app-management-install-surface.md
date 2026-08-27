---
id: AB-5
kind: feature
area: app-builder
needs: []
value: med
status: shipped
parent: AB-1
---

# Surface App Management install state to the dashboard and agents

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-08-27, from the owner's kit audit (Q6: commands worth surfacing).

The manifest persists `appBuilderComponents[id].installation`
({status, detail, at}) — and NOTHING renders or serves it: the integrations
drawer shows deploy state only, and no MCP tool reads install state. The
measured need is concrete: this session hand-scripted the GET /installation
step-tree read THREE times to answer "did it install, and which step failed".

Recommended minimal set, in value order:

1. **Drawer**: render the `installation` record on the integration's detail
   drawer (status + detail + timestamp) — the data is already persisted.
2. **MCP tool** `get_integration_install_status`: GET the app's own
   /installation state (step tree included) via AppManagementClient — the
   exact read the session scripted by hand; read-only, probe-callable.
3. **"Install into Commerce" action** (drawer + agent): re-run
   `installAppManagementApp` WITHOUT a redeploy — today the only way to
   retry an install is a full deploy_integration round.
4. Commerce Admin deep link to Apps > App Management (the hands-back
   destination) — candidate open_url target.

Also noted: `validateInstallation` (dry-run) exists on the API; low value
until someone asks.

## Shipped so far

- 2026-08-27  2026-08-27: shipped recs 1-3 — drawer renders the installation record (Commerce install row, error treatment on failed); get_integration_install_status reads persisted + LIVE state with failed step names; install_integration / the drawer's Install into Commerce kebab action re-run the install pass without a redeploy. Rec 4 (Commerce Admin deep link) not built — needs per-flavor Admin URL derivation; revisit if asked.
- 2026-08-27  2026-08-27: rec 4 shipped too — the drawer's Commerce-install row gained an 'Open Commerce Admin' link reusing the dashboard Admin tile's openAdminPanel message (getAdminPanelUrl already derives the URL for both flavors; no new derivation, owner's pointer).
