# Codebase sweep — 2026-08-11

Run at the `.127` release cut, after the `dream` pass. Five scans, ~30s.
Previous sweep: `.rptc/research/codebase-sweep-2026-08-05/`.

## Movement since last sweep

| Scan | Last (08-05) | Now (08-11) | Verdict |
|---|---|---|---|
| component-extraction | 9 groups | **4 groups** | **Improved.** The `step-view`/`step-nav-area`/`step-nav`/`commerce-body` trio that WAS the headline finding is gone — extracted. |
| code-duplication (jscpd) | 61 clones, 0.65% | 64 clones, 0.70% | Effectively flat. +3 clones on a codebase that grew; two cross-boundary clones examined below. |
| circular-dependency (madge) | 13 cycles | **13 cycles** | Flat. No new cycle. Not a finding. |
| dead-code doc-drift | 0 | **1** | **Regression.** Baseline says any hit is real, and it is. |

---

## Findings

### 1. Two EDS-config builders, and they have already drifted — HIGH

The same "derive `edsConfig` from the selected package's storefront" logic exists twice, and
the copies **no longer agree**.

- Sites: `src/features/project-creation/ui/steps/WelcomeStep.tsx:178-194` (a `useEffect`) and
  `src/features/project-creation/ui/steps/useProjectBuilder.ts:131-148`
  (`buildEdsConfigUpdate`).
- Shape: not two legitimate uses — `useProjectBuilder.ts:120` says so itself: *"Mirrors
  WelcomeStep.handleStackSelect **verbatim**."* One behaviour, written twice.
- **The drift, measured field-by-field:** `useProjectBuilder` sets 16 storefront-derived
  fields; `WelcomeStep` sets 14. Missing from `WelcomeStep`: **`codePatches` and
  `codePatchSource`** — and those are load-bearing, read at
  `src/features/eds/handlers/storefrontSetupPhases.ts:282-283` to apply code patches during
  storefront setup.
- **Failure mode** (read from code, not reproduced): `WelcomeStep`'s effect spreads
  `...state.edsConfig` first, so it does not *drop* the two fields — it refreshes the other 14
  from the newly-selected storefront and silently leaves those two behind. Change the demo
  package after a stack is chosen and `codePatches`/`codePatchSource` can stay pinned to the
  **previous** package's storefront.
- Proposal: extract one exported `buildEdsConfigFromStorefront(storefront, prev)` and call it
  from both. The standing Rule-of-Three override applies directly — the same behaviour has
  already been changed on one surface and not the other, which is demonstrated drift, so it
  extracts at two.
- Cost: small — one pure function, two call sites, plus a test that pins the field set.

### 2. `handleStackSelect` is a ghost symbol cited five times — MEDIUM

- Sites: `useProjectBuilder.ts:51, 63, 120, 155, 190`.
- Shape: those five comments point at **two functions that no longer exist**.
  `WelcomeStep.handleStackSelect` is gone (`WelcomeStep.tsx` has no such symbol), and
  `useModalState.handleStackSelect` is gone with `useModalState` itself, deleted when the
  `ArchitectureModal` was replaced. A repo-wide grep finds `handleStackSelect` **only inside
  these five comments** — zero definitions, zero call sites.
- Why it matters, not just untidy: each comment is a correctness claim ("mirrors X verbatim")
  whose referent cannot be checked, so the claim can never be falsified — and Finding 1 is what
  happens next. This is the `dream` run's theme showing up in code: a convention recorded in
  prose is not a constraint.
- Proposal: fold into Finding 1. Once the shared function exists, the comments become a
  reference to a real symbol, or they delete.
- Cost: none beyond Finding 1.

### 3. Doc drift — `addAppComponent` / `removeAppComponent` do not exist — LOW

- Site: `src/features/app-builder/README.md:67` documents
  `` `addAppComponent(project, gitUrl, deps)` / `removeAppComponent(project, appId, deps)` ``.
- Evidence: repo-wide, `addAppComponent` appears **exactly once — in that README heading**.
  The real symbol is `addAppBuilderComponent` (18 references in `src`). Left behind by the
  2026-06-21 "deployable → App Builder component" rename, which the memory records as covering
  72 files.
- Proposal: rename the heading and its body references.
- Cost: one edit.

### 4. ~~`page-container-padded page-header-section` — one wrapper, three copies~~ — WITHDRAWN

**Proposed, accepted, then withdrawn on implementation after opening the CSS. Not a finding.**

The scan shape was right — two classes, one identical trio (`ProjectsDashboard.tsx:177`,
`IntegrationsScreen.tsx:236`, `DashboardStatusHeader.tsx:75`) — but the verdict was wrong.
`page-container-padded` (`custom-spectrum.css:626`) sets `max-width` + horizontal padding and
is a genuine standalone utility; `page-header-section` (`:633`) adds only `padding-top: 24px`
/ `padding-bottom: 16px`. It composes with **four** different modifiers across the codebase —
`page-header-section`, `page-body-section` (`AiOverviewScreen.tsx:175`), `pb-6`
(`IntegrationsScreen.tsx:304`, `ProjectsDashboard.tsx:231`) and bare
(`OrgContextNotice.tsx:68`).

That is the base-plus-modifier idiom working, not one shell rendered three times. A
`PageHeaderSection` component would wrap a two-class string and break the composition — the
next screen would need `PageBodySection`, then `PagePb6Section`.

**The lesson for the next sweep:** "same set of files, several classes" is necessary but not
sufficient. Check whether the shared classes are a *base + modifier pair* before calling a trio
a shell — the base will have other modifiers, and grepping for those takes one command.

### 5. Carried from the session handoff — both confirmed present

- **`.dest-context` is 12.5px, off the type scale** — defined `custom-spectrum.css:4845`, with
  a scoped 12px override at `2107-2110` whose own comment admits the problem. The
  add-integration modal renders the same `DestinationContext` and still gets 12.5px.
- **`who_created: 'Demo Builder'` is dead weight** — `adobeEntityFetcher.ts:908`, exactly where
  the handoff said. Cosmetic; fold into the next edit of that file.

---

## Considered and rejected

### `page-container-padded` across 5 files — legitimate
A layout utility doing its job across unrelated screens. Same verdict as 2026-08-05; recorded so
the next sweep does not re-open it.

### `status-text` (4 files) and `icon-label` (4 files) — legitimate
Single utility classes on unrelated components (`StatusCard` + `OrgContextNotice` + two EDS
service cards; `ActionGrid` + `DashboardTile` + `AiZone` + `UtilityBar`). Neither shows the
several-classes-one-identical-set shape. These are the scan working correctly and finding
nothing.

### 13 circular dependencies — no movement
Identical count to baseline. Mostly same-feature handler/phase pairs
(`storefrontSetupHandlers` ↔ `storefrontSetupPhases` and its three phase files) and
registry/index pairs. Nothing new; not re-triaged this run.

### `ProgressUnifier.ts` — 4 internal clones
All four clones are inside the single file. Per the triage rule, same-file clones are usually
fine. Flagging only as a watch item: four repeated blocks in one file is the shape that precedes
a god-file split, so if `ProgressUnifier` grows again, run `decompose-god-file` rather than
re-reading this line.

### `webviewCommunicationManager.ts:320-340` ↔ `WebviewClient.ts:107-127` — 2 sites, no drift
Opened both. The pending-request settle (`clearTimeout` → `delete` → `reject`/`resolve` by
`responseToId`) is **logically identical**, but these are the two ends of one protocol —
extension side and webview side — and the surrounding dispatch genuinely differs
(`messageHandlers` vs `listeners`). Rule of Three: two sites, no demonstrated drift, so it
waits. **Trigger to revisit:** a third correlation-id consumer, or any fix applied to one end
only. That second condition is exactly what promoted Finding 1, so check here first next sweep.

---

## Baselines to carry forward

| Scan | Baseline (2026-08-11) | What movement means |
|---|---|---|
| component-extraction | **4 groups** | a NEW group, or one growing past 3 files |
| code-duplication (jscpd) | **64 clones, 0.70% lines** | a jump, or any clone crossing a feature boundary |
| circular-dependency | **13 cycles** | any new cycle; most existing ones are same-feature pairs |
| dead-code doc-drift | **0** (Finding 3 fixed this session; re-scanned clean) | any hit is real — confirmed against `git log` |
