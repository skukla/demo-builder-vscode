# Research: IMS Org Mismatch — Banner vs. Other Notification Forms

**Date:** 2026-06-18
**Branch:** `claude/ims-mismatch-notification-treo89` (merged from `develop`)
**Question:** The dashboard now shows an orange banner when the signed-in IMS org
doesn't match the project's org. Should that banner be converted to a notification
form we use more consistently (e.g. a blocking progress notification), or is the
banner the right approach?

---

## 1. What the feature currently does

Org-context surfacing on the **Project Dashboard** (a React/Spectrum *webview screen*)
is split into two decoupled halves — see commits `fbf4aef` and `67cb402`:

1. **"IMS Org" status badge** — a `StatusCard` peer of the Frontend / API Mesh / AI
   badges. Ambient health: blue `Checking…` → green *org name* (reachable) / red
   *wrong org* (mismatch). Shown only for Adobe projects.
   - `useDashboardStatus.imsOrgDisplay` (`src/features/dashboard/ui/hooks/useDashboardStatus.ts:389`)

2. **`OrgContextNotice` banner** — the *actionable* half. Orange, accent-bordered,
   `AlertCircle` icon, title "Wrong Adobe organization", a message naming **both**
   orgs, a no-loop hint after a failed switch, and a **`Switch IMS Org`** accent
   button. Renders `null` unless `orgCheckState === 'mismatch'`.
   - `src/features/dashboard/ui/components/OrgContextNotice.tsx`
   - CSS: `.dashboard-org-banner*` in `src/core/ui/styles/custom-spectrum.css:1901`

**Data flow:** `handleRequestStatus` sends status immediately and fires
`runOrgContextCheck` async (the cold `getOrganizations` call is ~3–4s), delivering
`pending → result` over a dedicated `orgContextResult` message so the slow check
never blocks the dashboard. Recovery: `Switch IMS Org` → `handleSwitchOrg` →
forced `aio auth login -f` → re-run status check (verify). If still mismatched the
banner persists with the no-loop hint — no silent loop.
(`src/features/dashboard/handlers/dashboardHandlers.ts:140,706`)

## 2. Notification surfaces used across the extension (inventory)

| Surface | Where | Count | Nature |
|---|---|---|---|
| `showInformation/Warning/ErrorMessage` (toasts) | extension host | ~130 | Transient, global chrome, optional action buttons |
| `withProgress({ Notification })` ("blocking progress") | extension host | ~37 | **Transient operation** w/ progress bar; auto-dismisses on completion |
| `setStatusBarMessage` | extension host | 7 | Transient success blips |
| Custom in-webview banner (`OrgContextNotice`) | dashboard webview | **1 (this feature)** | **Persistent until resolved**, scoped to the screen, inline action |
| `StatusDisplay` (centered error screen) | wizard/step webviews | several | Blocks step progress; full-screen |
| `StatusCard` badges | dashboard webview | many | Ambient status, passive |
| `LoadingOverlay` (modal spinner) | configure webview | a few | Blocks a screen during a deploy |

**House style for transient messages** = VS Code toasts. **House style for
long-running operations** = `withProgress`. There is **no shared "Banner"/"InlineAlert"
component** — `OrgContextNotice` is the only persistent in-UI alert of its kind.

## 3. Analysis — is a blocking progress notification a fit?

**No.** A `withProgress` notification models *a task in flight with a finite duration*.
The org mismatch is a **persistent state condition** that holds until the user chooses
to act. Specifically:

- **Nothing is "in progress."** There's no operation to attach a spinner to; the user
  must *decide* to switch orgs. An indeterminate progress bar with no end is misleading.
- **It must stay visible.** `withProgress` (and toasts) auto-dismiss. The mismatch — and
  its recovery affordance — must remain on screen the whole time the user is on the
  dashboard. A surface that disappears loses both the explanation and the `Switch` action.
- **It's screen-scoped, not global.** The mismatch belongs to *this project's dashboard*.
  VS Code notifications are global editor chrome — they'd fire regardless of which
  webview/editor is focused, and they can't sit next to the "IMS Org" badge they pair with.
- **Precedent agrees.** The dashboard already surfaces the analogous `needs-auth` state as
  an inline `Sign in` link, and mesh/auth errors as in-webview `StatusDisplay` — not as
  VS Code notifications. The banner is consistent with *that* (in-webview, contextual,
  actionable), which is the right axis of consistency for a dashboard condition.

**Where a blocking/progress affordance DOES belong:** the *recovery action*. Clicking
`Switch IMS Org` kicks off a forced browser login + status re-verify round-trip that
currently shows **no in-progress state on the dashboard**. That operation is exactly what
`withProgress`/a disabled-button-with-spinner is for. So progress feedback has a real role
here — as **action feedback on the button**, not as the mismatch surface itself.

## 4. The actual consistency gap

The meaningful inconsistency isn't "banner vs. progress notification." It's that
`OrgContextNotice` is a **bespoke `<div className="dashboard-org-banner">` with hand-rolled
CSS**, while the rest of the webview layer is Adobe Spectrum. It's a one-off with no shared
component, so the next persistent-alert need (session expiry, mesh needs-auth) can't reuse it.

## 5. Recommendation

1. **Keep the banner as the surface for the persistent mismatch.** It is the correct *form*
   for a persistent, screen-scoped, actionable condition. Do **not** convert it to a blocking
   progress notification or a toast — those are transient and would drop the standing
   affordance.
2. **Add progress feedback to the recovery action.** Give `Switch IMS Org` an in-flight state
   (disable + spinner / "Switching…") covering the forced-login + re-verify round-trip — this
   is the legitimate "blocking progress" moment and it's currently missing.
3. **(Consistency improvement) Extract a reusable, Spectrum-aligned notice/banner component**
   so the bespoke CSS becomes a shared idiom future persistent alerts can adopt.

**Net:** the banner is the right call; the gap worth closing is (a) missing progress feedback
on the *action* and (b) the bespoke-vs-reusable nature of the component — not the banner-vs-
notification choice.
