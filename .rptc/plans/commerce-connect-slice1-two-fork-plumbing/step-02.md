# Step 2: Content-SC "Join" Entry (link-resolving) — reuses `WizardContainer`

**Purpose:** Add the joiner's entry point. With a **public master** (decision recorded in
[engagement-modes-and-ownership](../../backlog/commerce-connect-aem-sc/engagement-modes-and-ownership.md)),
joining is a single **paste of a link**: a new "Join a shared storefront" entry resolves the link
by reading the **public** master (`config.json` + a small self-describing marker), shows a
**confirmation preview**, then opens the **existing** `WizardContainer` seeded with
`flow:'content'`, `upstream{owner,repo}`, and the inherited backend coords — with the brand
**gallery suppressed**. The wizard shell, webview/command plumbing, and wizard-seeding are all
**reused**; the only genuinely net-new parts are the **link-resolver** and the **preview** wiring.

**Prerequisites:**
- [ ] Step 1 complete (`flow` + `upstream` + predicates)
- [ ] How the existing create entry is registered/launched (`commandManager` + `src/commands/handlers/`; the projects-dashboard "Create" CTA)
- [ ] `GitHubFileOperations` read-file capability (public read of the master's `config.json` + marker)
- [ ] The existing import/edit **pre-populate-the-wizard** pattern (`settingsSerializer` / `projectToWizardState`)

---

## Reuse map (REUSE first; net-new only where flagged)

| Need | Reuse (existing) | Net-new |
|---|---|---|
| Home-screen "Join" entry | projects-dashboard entry + CTA pattern (`ShowProjectsListCommand`, `ProjectsDashboard`, the "Create" CTA, the `dispatchHandler` handler-map) — add a sibling entry | the entry's copy/route |
| Webview/command plumbing | `BaseWebviewCommand` + `WebviewCommunicationManager` + handler-map dispatch (as create/import commands do) | — |
| Paste-link field | `core/ui` `FormField` / existing input components | — |
| Confirmation preview | the existing review/summary presentation (`ReviewStep`) and/or shared confirmation/dialog component | preview content wiring |
| Read the public master | `GitHubFileOperations.getFileContents` (public read, no auth) for `config.json` + marker | the marker schema |
| Wizard shell + seeding | `WizardContainer` + the import/edit **pre-populate** pattern (`settingsSerializer` / `loadProjectIntoWizardState`) to inject initial state | gallery-suppress for the join flow |
| Starter "Share" link + marker | clipboard/share pattern (e.g. `copyAiPrompt`); EDS metadata write path (`populateEdsMetadata`) to also write the marker | the marker write |

*(Reconciled with the full reuse audit — see the consolidated Reuse-First Inventory in `overview.md`.)*

> **Scope guard:** the join **token is the plain public master repo URL**. Do **NOT** add link encoding, expiry, checksums, or a versioning scheme (the audit suggested these; rejected — a public URL has nothing to expire, and the master is read live). Resolution = fetch `config.json` + marker and map.

---

## Tests to Write First

### Unit: `tests/.../resolveJoinLink.test.ts`
- [ ] **Resolves a master link → `JoinDescriptor`** `{ upstream{owner,repo}, endpoint, storeCodes, packageId, flow }` by reading the public master's `config.json` + marker.
- [ ] **Missing/invalid marker** → graceful error surfaced to the UI (not a throw).
- [ ] **Public read needs no token** (assert no auth path invoked).

### Unit: `tests/.../joinEntry.test.ts`
- [ ] **"Join a shared storefront" entry/command is registered** and routed via the handler map.
- [ ] **Existing "Create" entry unchanged** (regression).

### React: `tests/.../WizardContainer-join.test.tsx`
- [ ] **WizardContainer accepts seeded state** (`flow:'content'`, `upstream`, coords) and **suppresses the brand gallery** (WelcomeStep package selection) for the join flow.
- [ ] **Seeded values forwarded** in the creation payload (consumed by Step 1's `ProjectCreationConfig`).

---

## Files to Create/Modify
- [ ] New: `resolveJoinLink` service (parse link → `GitHubFileOperations.getFileContents` for `config.json` + marker → typed `JoinDescriptor`)
- [ ] New: the "Join" entry command/handler (mirrors the create command; reuses `BaseWebviewCommand`)
- [ ] `src/features/projects-dashboard/...` — add the "Join a shared storefront" entry (reuse existing CTA/handler-map components)
- [ ] `WizardContainer.tsx` — accept seeded initial state; suppress gallery when joining
- [ ] `src/types/webview.ts` — `JoinDescriptor`; `WizardState.flow`/`upstream`
- [ ] Starter side (small): write the self-describing **marker** (package id, flow) into created storefronts (extend `populateEdsMetadata`'s write path) so they can serve as masters
- [ ] test files above

---

## Implementation Details

### RED
Write `resolveJoinLink` + entry-registration + WizardContainer-join tests; all fail.

### GREEN
- **Resolve:** `resolveJoinLink(link)` → parse the master repo URL → `GitHubFileOperations.getFileContents('config.json')` + the marker → map to `JoinDescriptor` (reusing the same `config.json` field keys `configGenerator` understands).
- **Entry:** register "Join a shared storefront" via the existing command/handler-map pattern; on submit, resolve the link, render the **confirmation preview** (reuse the review/summary presentation), then launch `WizardContainer` seeded via the import/edit pre-populate path with `{flow:'content', upstream, coords, packageId}`.
- **Gallery suppress:** when `flow:'content'` + seeded upstream, the WelcomeStep brand gallery is hidden (the brand is inherited) — compose with Step 3's flow-aware filtering.
- **Marker:** extend the storefront-creation write path to drop a small marker (package id, flow) into the repo so a created storefront is join-resolvable.

### REFACTOR
- Keep `resolveJoinLink` a pure fetch+map (no wizard coupling); keep the entry thin over `BaseWebviewCommand`.
- Prefer reusing the import/edit seeding path over inventing a new wizard-init path (DRY).

---

## Acceptance Criteria
- [ ] "Join a shared storefront" entry resolves a public master link → preview → gallery-less wizard seeded with flow/upstream/coords/package.
- [ ] Public read needs no auth; bad marker degrades gracefully.
- [ ] Existing "Create" entry + flow unchanged (regression green).
- [ ] No duplicated wizard shell or wizard-init path; reuses container + pre-populate pattern.
- [ ] Created storefronts carry the self-describing marker.

**Estimated time:** 5–7 hours
