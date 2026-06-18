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

---

## 6. Addendum — "the existing blocking re-login flow" (PM clarification)

PM clarified "blocking progress notification" meant the **existing blocking re-auth
flow**, not `vscode.withProgress`. That flow is `ensureAdobeIOAuth`
(`src/core/auth/adobeAuthGuard.ts`): the shared *pause-and-prompt* gate —
`check → showWarningMessage('… sign-in required', 'Sign In', 'Cancel') → forced
login → verify` — reused by mesh deploy, configure, EDS reset/storefront setup,
project reset (9 call sites).

**The codebase already models TWO distinct conditions, separately:**

| Condition | Meaning | Current surface | Moment |
|---|---|---|---|
| **Auth expired / missing** | No valid token | `ensureAdobeIOAuth` blocking gate (Sign In/Cancel) | **Reactive** — at the moment a gated action runs |
| **Org mismatch** | Token *valid* but reaches the *wrong* org | IMS Org badge + `OrgContextNotice` banner | **Proactive** — on dashboard load |

These fire at *different moments*, which is why it's **not either/or**:

- The blocking gate only triggers **when the user initiates a gated action**. A user
  who just opens the dashboard to look around would get **no signal** that anything is
  wrong until they click Deploy/Configure. The mismatch is knowable at *load* time, and
  the banner is what telegraphs it non-surprisingly (the stated design goal in `67cb402`).
- A modal that auto-pops on load (before any action) would be the *surprising* behavior
  the team explicitly designed against.

**The real gap this surfaces — the action-time path is a dead end.** When a gated action
hits a mismatch today, `deployMesh.ts:85` (and peers) show a **button-less**
`showWarningMessage("… uses a different org … Use 'Switch IMS Org' on the dashboard")`.
It detects the problem but offers **no inline recovery** — it bounces the user back to the
banner. That is exactly where the `ensureAdobeIOAuth` blocking pattern *should* be adopted:
make it a real **"Switch IMS Org / Cancel"** gate that performs the forced switch inline,
consistent with how expired-token is handled.

### Revised recommendation — three coordinated layers (not either/or)

1. **Ambient — IMS Org badge.** Always-on at-a-glance truth. *(exists, keep)*
2. **Proactive — `OrgContextNotice` banner.** On-load heads-up + Switch action; makes the
   condition knowable before the user clicks anything. *(exists, keep — the blocking gate
   cannot replace this; it can't fire proactively without being intrusive)*
3. **Reactive — blocking org-context gate at action time.** Generalize `ensureAdobeIOAuth`
   (or add a sibling `ensureProjectOrgContext`) so deployMesh/configure/reset/etc. turn the
   current dead-end warning into a real blocking **"Switch IMS Org / Cancel"** prompt with
   inline forced switch. This is the consistency win the PM is pointing at — it harmonizes
   the *action paths* with the established auth-expiry pattern and gives the banner a proper
   backend twin (one shared remediation primitive).

**Answer to "blocking flow + status indicator, or stick with the notice?":** keep the badge
**and** the notice (they own the *ambient* + *proactive* moments the gate can't), **and**
additionally adopt the blocking gate for the *reactive/action-time* moment where today there's
only a dead-end warning. The notice is not replaced — the blocking flow fills a different,
currently weak, slot.

---

## 7. Addendum — telegraphing the check via the update-check toast? (PM challenge)

PM asked: the "Check for Updates" flow telegraphs itself with a progress toast
(`vscode.window.withProgress({ location: Notification, title: 'Demo Builder Updates' })`
reporting `'Checking for updates...'` — `checkUpdates.ts:55`). Would taking *that*
approach be the more reasonable way to telegraph the org-context check?

**Deciding factor: user-initiated vs. automatic.** The update toast works because the
user *ran the command* — the toast is feedback for an action they just took and are
actively awaiting. That's the correct home for `withProgress`: a **user-initiated,
awaited, discrete operation**. The proactive org check is the opposite on every axis:

- **Not user-initiated.** It fires automatically on every dashboard load
  (`handleRequestStatus → runOrgContextCheck`). An unprompted toast on *every* dashboard
  open, for a background check, is notification noise — the update toast avoids this
  precisely because it only appears on demand.
- **Already has a consistent home.** The "IMS Org" badge is a peer of the Frontend /
  API Mesh / AI badges, and all of them telegraph in-flight state *inline*
  ("Loading status…", "Starting…", "Verifying"). A toast for IMS Org but inline badges
  for its three siblings would be the inconsistency. The deliberate
  `FRONTEND_TIMEOUTS.ORG_CHECK_MIN_DISPLAY` gate shows telegraphing was already a design
  goal — they chose the ambient surface on purpose.
- **Usually a no-op.** The check normally resolves to "ok"; a toast for a check that
  typically finds nothing wrong is mostly wasted attention. A quiet badge is the right weight.
- **Auto-dismiss vs. persistent result.** A "Checking…" toast vanishes on resolve, but a
  mismatch is persistent and still needs the banner — so the toast adds a second surface
  for one event without replacing anything.

**Where the toast pattern DOES fit — the user-initiated moments.** The update-check toast
is the right telegraph for awaited operations, which maps onto layer 3 (reactive), not the
passive load check:

| Moment | Nature | Right telegraph |
|---|---|---|
| Proactive load check | automatic, passive, usually no-op | **inline "Checking…" badge** (not a toast) |
| Switch / action re-verify | user-initiated, awaited | **`withProgress`-style toast** (the update-check pattern fits here) |
| Persistent result (mismatch) | standing condition | **notice banner** |

**Answer:** for the *passive load-time* check, the inline badge is more reasonable than a
progress toast (unprompted-on-every-load noise, inconsistent with sibling badges, usually a
no-op, and auto-dismisses while the real result is persistent). The update-check toast is the
right model for the *user-initiated* moments — the forced "Switch IMS Org" re-verify and the
action-time gate — i.e. layer 3, not the telegraph of the automatic check.

---

## 8. User journey — how the surfacing is shown

Setup: a project created in **Org A**, but the user's IMS token currently reaches
**Org B** (e.g., a stale browser SSO tab signed them into Org B). Tags mark what
exists today (**exists**) vs. what's proposed (**proposed**).

### Scene 0 — Open the dashboard (proactive check begins) · *exists*
- Dashboard renders **immediately** — the status payload isn't blocked by the org check.
- Status row badges: `Frontend` · `API Mesh` · `AI` · **`IMS Org: Checking…`** (blue).
- `handleRequestStatus` fires `runOrgContextCheck` async (cold `getOrganizations` ≈ 3–4s);
  the `ORG_CHECK_MIN_DISPLAY` gate keeps "Checking…" perceptible so the result doesn't flash.
- Non-Adobe / EDS-only projects: no IMS Org badge, no banner — the flow doesn't apply.

### Scene 1a — Check resolves OK (common case) · *exists*
- `IMS Org` badge flips blue → **`Org A`** (green). No banner. User works normally.

### Scene 1b — Check resolves to a mismatch · *exists*
- `IMS Org` badge turns **`Org B`** (red) — the wrong org, named.
- Notice banner slides in below the status row: orange AlertCircle, **"Wrong Adobe
  organization"**, "You're signed into **Org B**, but this project was created in **Org A**.",
  and a **[Switch IMS Org]** button. Not modal — the deliberately non-surprising heads-up.

### Scene 2 — User clicks Switch IMS Org (proactive recovery)
- Button enters an in-flight state: **`Switching…`**, disabled, no double-submit. · *proposed*
- Forced `aio auth login -f` opens the browser with the IMS account/org chooser (a
  non-forced login could silently reuse the wrong SSO session). · *exists*
- User picks **Org A** → re-verify: badge → blue `Checking…` → green **`Org A`**, banner
  disappears. Recovered. · *exists*

### Scene 3 — The switch didn't take (no-loop guard) · *exists*
- If the token still reaches Org B after the forced switch (another tab reasserted the SSO),
  the banner persists and adds: "Another browser tab may be holding **Org B** — close it, or
  pick this project's organization in the sign-in window." Button re-enables; no silent loop.

### Scene 4 — User ignores the banner and clicks a gated action (reactive gate)
- User skips the banner and clicks **Deploy Mesh** (or Configure save / Reset) while mismatched.
- **Today:** a button-less warning bounces them back to the dashboard banner — a dead end. · *exists*
- **Proposed (layer 3):** the action's pre-flight hits a shared org-context gate showing a
  blocking **"Switch IMS Org / Cancel"** prompt (same shape as the expired-token sign-in gate),
  telegraphed with progress while the forced switch + re-verify runs:
  - **Switch** → inline forced login → clean → the original action **continues**; still wrong →
    aborts with the same no-loop guidance.
  - **Cancel** → action aborts cleanly; banner still standing.

### Surface ↔ moment mapping

| Moment | Surface | Weight |
|---|---|---|
| Automatic load-time check | `IMS Org` badge: `Checking… → Org A / Org B` | ambient, passive |
| Standing mismatch, before any action | notice banner + Switch | persistent, visible-not-modal |
| User-initiated switch / gated action | `Switching…` feedback + blocking gate | progress telegraph + modal stop |

Throughline: **the surface matches the moment** — passive check → quiet badge; standing
condition → banner; user-initiated/awaited → progress + blocking prompt.

---

## 9. Where else should the action-time gate (`ensureProjectOrgContext`) live?

After landing the gate in `deployMesh`, the question is which other create/edit/lifecycle
steps need it. Mapped every org-bound Adobe I/O entry point (all 9 `ensureAdobeIOAuth`
call sites + the create/edit flows).

### The decision rule
Add the gate only where **all** hold:
1. It's a **user-initiated action** (not a passive/background check).
2. It runs an **org-bound Adobe I/O op** (in practice: mesh deploy/redeploy — the only
   runtime Adobe op; storefront sync/republish are GitHub/Helix/DA.live, not Adobe I/O).
3. It operates on an **existing project's stored org** (so a token/stored-org mismatch is
   possible) — i.e. not the creation flow, where the org is *derived from the current
   sign-in*.
4. It **doesn't already inherit the gate** by delegating to the `deployMesh` command.

### Findings

| Site | Mesh op via | Gated today | Verdict |
|---|---|---|---|
| `mesh/commands/deployMesh.ts` | command (self) | ✅ gate | **done** |
| `dashboard/commands/configure.ts` (save → redeploy) | `executeCommand('demoBuilder.deployMesh')` (configure.ts:778) | ✅ **inherits** the command's gate | **no change** — adding one would double-prompt |
| `lifecycle/services/projectResetService.ts` (headless reset) | `deployMeshComponent` **service, direct** (line 274) | ❌ only `ensureAdobeIOAuth` (line 235) | **ADD** — genuine gap |
| `eds/services/edsResetMeshHelper.ts` (EDS reset) | `deployMeshComponent` **service, direct** (line 47) | ❌ only `ensureAdobeIOAuth` | **ADD** — genuine gap |
| `dashboard/handlers/dashboardHandlers.ts` (status check) | verification only; auth degrades to `needs-auth` badge | passive | **no** — background check; org mismatch is already surfaced *proactively* by the banner. A blocking prompt on auto-load would be the "surprising" behavior the design avoids |
| `eds/.../storefrontSetupHandlers.ts`, `eds/handlers/edsHandlers.ts` (store discovery) | creation-time | n/a | **no** — org is being chosen now (sign-in-driven); nothing to mismatch against |
| Project **creation** (wizard → executor) | n/a | n/a | **no** — `project.adobe.organization` is *derived from* the wizard's signed-in token (`buildProjectConfig` ← `wizardState.adobeOrg`); the creating token reaches that org by construction |
| republish / sync storefront / refresh block library | DA.live / GitHub / Helix | n/a | **no** — not org-bound Adobe I/O |

### Conclusion
**Two genuine additions: the headless reset (`projectResetService.ts`) and the EDS reset
(`edsResetMeshHelper.ts`).** Both redeploy mesh by calling `deployMeshComponent` *directly*
(bypassing the command's gate) and already do a blocking `ensureAdobeIOAuth` mid-pipeline —
so dropping `ensureProjectOrgContext` right after it is the natural, consistent insertion
(same user-initiated, mid-pipeline blocking slot). Insert it in each flow's existing
"can we redeploy?" auth pre-flight (e.g. `projectResetService.ts:235-247`), returning the
not-reachable/cancelled outcome the same way the auth check does.

**Configure save needs nothing** — its redeploy delegates to the already-gated `deployMesh`
command (a second gate would prompt twice). The corollary: keep routing mesh work through the
command where possible; the two reset flows are the exception because they call the service
directly to fit their pipeline + org-context targeting.

**Nothing in the creation flow** — the org there is established from the current sign-in, so a
mismatch gate is meaningless (and would fire spuriously).

### Refinement after PM review — consolidate, don't sprinkle (implemented)

The PM noted that adding the org call to two reset files is a refactor smell: the gate
divergence is a *symptom* of duplicated pre-flight. Verified the deeper picture:

- The dashboard **command inlines its own deploy** (`aio api-mesh:update`, `deployMesh.ts`)
  with pre-flight `{auth, org, App Builder}`; the **`deployMeshComponent` service** is a
  *separate* deploy primitive used by **creation** (`meshSetupService`, `createProject`) and
  **both resets**, each re-implementing pre-flight (resets had `auth` but not `org`).
- The gate **cannot** live in `deployMeshComponent` — creation calls it, and at creation the
  org is sign-in-derived (a mismatch prompt would fire spuriously). So the primitive stays
  dumb; the gate belongs in the pre-flight layer.

**Done:** extracted `ensureProjectAdobeContext` (auth → org, one result with `blockedBy`) and
adopted it at the three existing-project entry points — `deployMesh` (replacing its two
hand-wired guards) and both reset flows (`projectResetService`, `edsResetMeshHelper`). The
gate is now structurally impossible to forget. Creation keeps its own sign-in-derived path;
the primitive is untouched.

**Backlog (next):** the two divergent deploy code paths (command-inline `aio api-mesh:update`
vs the `deployMeshComponent` service) are the deeper duplication — unify them so the command
also routes through the service. Tracked in `.rptc/backlog/unify-mesh-deploy-pipeline.md`.
