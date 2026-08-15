# Integrations: dedicated surface + dashboard summary tile

> **Status: APPROVED (direction) 2026-07-30 — no code written yet.** Supersedes the hosting
> decision in `.rptc/plans/integrations-grid/overview.md` (steps 1–8), shipped on
> `feature/integrations-grid` @ `d4c4d193`. Most of that plan's components are reused; the
> Drawer primitive is superseded (see decision 1).
>
> Decided by rendering two comparison prototypes side by side rather than arguing in prose:
> `.rptc/research/app-builder-integration-model/compare-A-composite-dashboard.html` and
> `compare-B-dedicated-surface.html`. **Option B chosen.**

## Why

**First, what the prior art does and does not say.** `research.md:202-204` places the grid IN the
dashboard: "Dashboard (later, post-deploy) — the live-management grid + detail drawer… This is
where deploy status earns a grid." It does NOT propose a separate screen.

The grid prototype (verified by rendering it at 1280×900) shows the integrations zone in
ISOLATION: `.wrap { max-width: 1060px; margin: 0 auto }`, a placeholder masthead reading
"Project dashboard · prototype", and `.drawer { position: fixed; top: 0; right: 0; height: 100%;
width: 392px }`. It contains zero depiction of the dashboard's status header or action tiles
(verified: no matches for any of them in the file). Those CSS traits are how a zone gets mocked
standalone — they are NOT evidence of a dedicated-screen intent, and an earlier draft of this
plan wrongly read them that way.

**So the composite page was never designed.** Nobody drew a status header + six action tiles +
destination banner + 3-column grid + a viewport-height drawer as one page. The integrations-grid
plan assembled the grid below the action tiles — a fair reading of "in the dashboard" — and the
result feels arbitrary because it was assembled rather than designed.

**The dedicated surface proposed here is therefore a NEW design decision, not a recovery of
intent.** Its case rests on two observations, both of which should be weighed on their merits:
a viewport-fixed full-height drawer covers the whole webview to inspect one card in a
subsection; and the grid wants ~1060px to read as 3 columns while the dashboard band is ~900px
and already crowded.

**The alternative — design the composite dashboard page properly and keep the grid in it —
is legitimate and cheaper**, since it needs no new webview surface. It should be rejected on
evidence, not skipped. See "Decisions to confirm" #0.

## Decisions — RESOLVED 2026-07-30

0. **Dedicated surface, or design the composite dashboard page? → DEDICATED SURFACE (option B).**
   The composite page (option A) was drawn in full and rejected: it works, and is far cheaper,
   but it only fits by shrinking everything above integrations (status to one row, action tiles
   to compact buttons) and it still grows without bound with integration count. B is the only
   option that keeps the dashboard fixed-size.

1. **Detail pane → FLYOUT over the grid. (Settled 2026-07-30, after one reversal.)**

   The decision history matters, because it moved twice and the reasoning changed each time:

   - *Originally:* keep the built `Drawer` — argued from it being built and test-pinned. That
     was sunk cost, not a design reason.
   - *Then:* master/detail, a page-scoped sticky panel beside the grid. The argument was that a
     drawer "covers the grid you just navigated to". But that observation came from the grid
     living in a **dashboard subsection**, where a viewport-fixed drawer covered the entire
     webview to show one card. On a dedicated full-width surface that objection does not hold —
     the surface IS the integrations page, so an overlay covers only its own grid.
   - *Now:* a flyout over the grid, which is what the original grid prototype specified
     (`position: fixed; top: 0; right: 0; height: 100%; width: 392px` + scrim).

   **Consequence:** `Drawer.tsx` and `Drawer.test.tsx` are RESTORED (`git show
   25ec2327:src/features/dashboard/ui/components/integrations/Drawer.tsx`) rather than rebuilt —
   the scrim, Esc-when-not-`defaultPrevented`, focus capture/restore and minimal Tab wrap were
   all already test-pinned, and a flyout needs every one of them. The interim master/detail pass
   was not wasted: it kept the CONTENT (`IntegrationDetailPanel`) separate from its host, so the
   host swaps without touching the rows, the action bar, or the inline rename — and it added the
   Destination row and one-API-per-line treatment, both of which stay.

   **The lesson to keep:** the drawer-vs-panel question was never answerable in the abstract. It
   depended entirely on whether the grid owned the whole surface, and that changed underneath the
   decision. Re-ask a layout decision when its host changes.

2. **Dashboard section → SUMMARY TILE.** One tile among the action buttons: worst-status dot +
   "Integrations" + count + chevron. Opens the surface. This is the whole integrations footprint
   on the dashboard.

3. **Destination banner → RESTORE.** The integrations-grid plan cut it as YAGNI because the
   "workspace name [is] not in init payload". That premise is stale — `.demo-builder.json`
   carries `adobe.projectTitle` and `adobe.workspaceTitle` (verified on `demo-builder-test`:
   "Kukla Mesh" / "Stage"). Renders once above the grid with a Change affordance, and repeats as
   a `Destination` row in the detail panel.

## What to do with `feature/integrations-grid`

It is 2 weeks behind develop and still owes its Dev Host visual pass. **Recommend merging it
first anyway**, rather than letting it diverge further: the backend seams (rename payload,
snapshot channel), the card model, the card, the add modal, and both hooks are all keepers and
are gated green. The dashboard grid it lands is strictly better than the stacked list it
replaces, and it is a short-lived intermediate state. `Drawer.tsx` lands and is then deleted by
this plan — accepted churn, and cheaper than a long-lived stale branch.
Merge develop into it first (that clears the 28 vendored-fixture lint errors via `7c6d620c`).

## NOT in scope — and why

**Wizard/dashboard visual parity is explicitly rejected by the design.** The wizard prototype
(`prototype-integrations-wizard.html`) states it directly: a wide card grid "would collapse to
1–2 columns and read like a second dashboard"; pre-deploy there is "no live status / URL /
redeploy to show"; and edit/detail "opens the existing Add-Integration modal — no new drawer;
the wizard already has enough chrome". The two surfaces are intentionally different because
their data differs — the wizard is pre-deploy identity, the dashboard is live status.

The one REAL wizard gap the prototype names: destination is shown **once at the top with a
Change link**, not repeated per row as it is today. Track that separately; it is not this plan.

> **Followed up 2026-08-15** (`fix/wizard-integrations-parity`). The destination gap is closed
> — the wizard now renders one `DestinationContext` line above the list. The wizard ALSO
> adopted the card itself, which this section's "What carries over" already classed as
> surface-agnostic: `IntegrationCard` + `IntegrationActionsMenu` + the model TYPES moved to
> `core/ui/components/integrations/`, and the dashboard imports them from there. The
> derivations did not move and must not — they read `useDashboardStatus` and
> `@/features/app-builder/*`.
>
> **The rejection above still stands and was re-measured before the work started:** no grid
> and no drawer in the wizard. Where the dashboard card shows deploy status, the wizard passes
> a `subline` (origin · API count) instead, because pre-deploy there is no status that differs
> between cards.

## What carries over

**Unchanged:** `integrationCardModel.ts` (the whole derivation + both matrices),
`IntegrationCard`, `AddIntegrationModal`, `useRowStatusOverrides`,
`useLiveAppBuilderComponents`, and both push channels (`appBuilderComponentStatusUpdate`,
`appBuilderComponentsSnapshot`) — presentation or transport over the same model, all
surface-agnostic. Their tests move with them.

**Re-hosted:** `IntegrationDrawer`'s content (rows, action bar, inline rename) becomes the
master/detail panel body. `IntegrationsGrid` keeps its cards, add tile, and the ONE
`handleAction` switch; only its host and selection layout change.

**Deleted:** `Drawer.tsx` + `Drawer.test.tsx` (decision 1). `IntegrationsBlock` is replaced by
the summary tile.

## Shape of the work

1. **Summary tile** on the dashboard — worst-status dot + count + chevron → opens the surface.
   Replaces `IntegrationsBlock`. (`ActionGrid` neighbour conventions apply.)
2. **New webview surface** — command + panel + bundle entry, following the existing
   dashboard/configure/projectsList precedent in `esbuild.config.js` and `BaseWebviewCommand`.
   Use the `webview-command-handler` skill for the message wiring.
3. **Re-host `IntegrationsGrid`** in the new surface, plus the destination banner (decision 3).
4. **Master/detail panel** — replace the `Drawer` host with a sticky side panel; delete the
   Drawer primitive and its suite. Selection state stays as-is (fresh model lookup each render,
   so live pushes and card removal already behave).
5. **Back navigation** to the dashboard, matching the "All Projects" precedent.
6. **Tests** — port the grid suites to the new host; retire the Drawer suite; add summary-tile
   tests and screen-level wiring tests for the new surface.

## Risks

- **The new webview surface is the bulk of the cost**, not the UI — handshake, message registry,
  bundle entry, and the headless/MCP implications of a new panel. Budget accordingly.
- The dashboard's own layout problems (tile emphasis, dead space, competing button
  vocabularies) are adjacent but separate. NOTE: option A's drawn solution to them (one-row
  status, single emphasis rule, compact action buttons) is worth harvesting independently of
  this plan — see `compare-A-composite-dashboard.html`.
- Deleting a test-pinned primitive (`Drawer`) is deliberate, not accidental. If the panel later
  needs modal behaviour, it should be rebuilt against that requirement, not resurrected.

## Verification

Serve `.rptc/research/app-builder-integration-model/` over `python3 -m http.server` and drive
the browser tools against `compare-B-dedicated-surface.html` (file:// does not reach the
Dockerised browser — use `host.docker.internal`). Compare the built surface to it: summary tile
on the dashboard, breadcrumb, destination banner, 3-column grid, card face rules, and the detail
panel's rows (Destination present, APIs one per line).

Two divergences from the ORIGINAL grid prototype to reconcile while there — both are in shipped
code today: it renders Remove as a red/negative button (the prototype uses a plain outlined
button on its own row), and it joins APIs with commas (the prototype lists one per line).
