# Next session — start here

Written 2026-08-03 at the end of a long session. `develop` is pushed and green
(jest 923 suites / 11712 tests, tsc, eslint, build).

## Start with this

**`.rptc/plans/integrations-host-contract/step-02.md` — the live bug.**

The log says 726 projects were fetched; the modal says "No Projects Found" at the same
instant. Not an org problem (that was a missing `authManager`, fixed in `0807d1c4`) and
not a fetch failure. The results are not reaching the picker. The step lists three
candidates cheapest-first and names the control to diff against: the WIZARD renders the
identical picker with the identical hook and message, and it works there.

Reproduce before reading code: open Integrations → Add Integration → Change.

## Then

1. `integrations-host-contract/step-01.md` — the flow exports its own handler map so
   hosts stop hand-listing it. Do this BEFORE the destination-control plan, which adds
   another host requirement. One decision to make first: `switchOrg` currently lives in
   `dashboardHandlers`, and importing it from `project-creation` is feature→feature.
   Moving `handleSwitchOrg` to `features/authentication/handlers/` is probably right —
   it is auth recovery, not dashboard UI.
2. `integrations-destination-control/step-01.md` — page-level destination control.
   Fully specified, no open questions except the "deployed integrations still point at
   the old workspace" copy-vs-stale decision.
3. **`per-integration-api-attribution` steps 04–06** — the actual feature work, parked
   all session. Steps 01–03 shipped but **step 03 was never verified against live
   Adobe**: confirm `componentApiPicks` lands in a real manifest and that a mesh
   redeploy leaves Developer Console subscriptions unchanged. Do that verification
   BEFORE 04 builds on it.

## Unverified in the current build

Shipped but never seen working. All reachable from Integrations → Add Integration → Change:

- "Switch IMS Org" on a genuine org mismatch (`3defc797`)
- The browser-opening notification on sign-in and org switch (`cb74b147`)
- The kind-card grid wrapping instead of overflowing (`3defc797`)
- Modal sizing after the fullscreen fix (`799acd41`) — the panel should hug its content

## Standing observation

`API Mesh` has shown **MESH ERROR** in every screenshot for two days and has never been
investigated. We fixed the REPORTING of mesh status early on (`deployMeshHeadless` was
not persisting failures) but never the failure itself. Worth ten minutes with
`debug-log-triage`.

## What this session established (do not re-derive)

- An unregistered message type used to fall through in SILENCE. That one missing `else`
  was the mechanism behind four separate wiring bugs, all of which presented as external
  faults. Fixed in `2cce8e79` — unhandled types now log and reject by name.
- Three source-reading guards exist and are load-bearing:
  `webviewHandlerCoverage` (every panel answers what its UI sends),
  `requestTimeouts` (slow messages are budgeted),
  `panelHandlerContext` (no panel builds a context with undefined managers).
  **A green guard proves nothing until you have seen it go red** — four versions of the
  coverage guard passed while catching nothing. Verify negatively before trusting one.
- `DialogContainer type="fullscreen"` outranks every size and CSS override. When a style
  override does not take, READ THE DOM before writing a second one (cost four attempts).
- New skills/docs added today: `reuse-first` + `src/core/ui/components/CLAUDE.md`
  (the job→component vocabulary), `webview-test-authoring` §8 (mock drift),
  `spectrum-webview-ui` (the fullscreen trap + read-the-DOM rule).
