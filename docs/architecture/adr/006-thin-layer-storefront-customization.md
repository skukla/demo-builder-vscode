# ADR-006: Thin-Layer Storefront Customization — Retire the CitiSignal Forks, Point at Canonical + Code Patches

**Status**: Accepted
**Date**: 2026-06-10
**Decision Maker**: Project Owner (confirmed 2026-06-10 on the audit findings)
**Implementer**: Not started — implementation is a separate workstream (see "What This ADR Does Not Decide")

---

## Context

### The Problem

Demo Builder ships EDS storefronts from forked copies of Adobe's canonical `hlxsites/aem-boilerplate-commerce`. Two of those forks are in scope here:

| Fork | Ahead of canonical | Behind canonical |
|---|---|---|
| `skukla/citisignal-eds-boilerplate` | 146 commits | 185 commits |
| `demo-system-stores/accs-citisignal` | 119 commits | 212 commits |

The "behind" numbers grow every month. The forks exist to carry our customizations, but they also force us to carry **all of canonical's evolution by hand** — the sync-project estimate was 3–5 days per cycle, indefinitely. The 2026-06-09 My Account selector-race bug made the cost concrete: the bug existed upstream too, sat undetected in our fork for months, and the fix had to land as a fork commit.

The question this ADR resolves: **do the forks store enough genuine customization to justify their maintenance cost, or can Demo Builder apply the same customizations as a thin layer on top of canonical at storefront-create time?**

### What the audit found

Full audit: `.rptc/research/thin-layer-storefront-evaluation/findings.md` (2026-06-10). The load-bearing facts:

1. **There is one customization surface, not two.** Every one of accs-citisignal's 119 ahead-commits exists in citisignal's history by identical SHA (citisignal was forked from accs). Citisignal adds only 27 commits of its own. The deduped surface is 146 commits — and at the file level, accs's customizations are a strict, byte-identical subset of citisignal's.
2. **30% of the net diff isn't customization at all** — it's manual upstream catch-up (copies of newer canonical content, verified blob-identical). This labor disappears entirely when cloning canonical HEAD directly.
3. **The genuine surface is 76 files**: 30 additive (nine new blocks — embed, form, hero-v2, product-teaser, quote, search, table, tabs, video — plus an `aem-assets.js` sanitizing wrapper), 13 already covered by existing Demo Builder mechanisms or droppable, and 33 modifications to canonical files — of which 24 are ≤6-line mechanical changes. Nothing resists a patch model; the largest item is an append-heavy CSS theme file, the most complex a ~50-line carousel rewrite.
4. **The code-patches mechanism has already run in production — this ADR reinstates it, not invents it.** See "Prior art" below: the extension shipped a template-patch system in January 2026, whose patches were later baked into the fork (`911b6ac8`) and the system removed.
5. **Demo Builder already has every other mechanism.** Block-library installation with UE-config merge exists (`blockCollectionHelpers.ts`), `contentPatches` exists (`contentPatchRegistry.ts`) including an *external patch repo* source (`skukla/eds-demo-content-patches`, fetched at create time), `demo-config.json` templating exists, and code vendoring into canonical files exists in production for smart-404 (`pdp404HandlerPublisher.ts`, ADR-005).

### Prior art: the template-patch system (v1) and why it was removed

The extension already had a code-patches mechanism once. The full lifecycle, from git history:

| Date | Commit | Event |
|---|---|---|
| 2026-01-20 | `6026b695` | **Template-patch system added**: `templatePatchRegistry.ts`, metadata in `config/template-patches.json` (id, filePath, description), payloads as `config/patches/{id}.ts` modules (`searchPattern`/`replacement`), wired via a `patches` field in `demo-packages.json`. Five patches shipped: `header-nav-tools-defensive`, `aem-assets-sku-sanitization`, `product-link-sku-encoding`, `product-link-sku-slash-encoding`, `personalization-auth-guard`. |
| 2026-01-29 | `cfbd05ba` | Patched code files published to the live CDN — the system worked end-to-end in production. |
| 2026-01-29 | fork `911b6ac8` | The five patches **migrated into the fork** ("feat: apply code patches for demo compatibility" — 3 applied, 2 recorded as "not applied — code structure changed"). |
| 2026-02-01 | `f6a7d029` / `06dd6549` | **System removed**: "The patch system was over-engineered for issues now fixed in the template." |

The removal rationale was correct *under the fork model*: with a fork available, fork commits and create-time patches were two competing sources of truth for the same fixes, and once the patches were baked into the fork the patch layer was dead weight. **This ADR removes the fork, which inverts that judgment** — the patch layer becomes the *only* home for modifications, and the instability that killed v1 (two places to fix the same thing) is resolved in the opposite direction. The v1 episode is evidence the mechanism works, and evidence that exactly one source of truth must exist.

---

## Decision

**Retire both forks as Demo Builder templates. Point the CitiSignal packages at canonical `hlxsites/aem-boilerplate-commerce` — at an automation-verified last-known-good commit, at most about a day behind `main` (see the gate below), never a hand-maintained pin — and apply our customizations as a thin layer at storefront-create time.** The two repos' fates differ (amended 2026-06-10): **`skukla/citisignal-eds-boilerplate` (our fork) archives**; **`demo-system-stores/accs-citisignal` is the demo team's boilerplate** — it is retired as our *template* but continues as the live *block-source upstream* (see "Two upstreams" below), and archiving it is the demo team's call, not ours.

The layer, by customization class:

| Customization class (from audit) | Mechanism | Status |
|---|---|---|
| 9 demo-team blocks + UE wiring | Block-library installation with UE-config merge, **sourced live from the demo team's boilerplate** (`demo-system-stores/accs-citisignal`) — one config-line change in `block-libraries.json`, currently pointed at our fork | **Exists** |
| Per-demo Commerce config (`demo-config.json`) | Create-time config templating | **Exists** |
| DA content | `contentSource` copy + `contentPatches` | **Exists** |
| Smart-404 PDP recovery | Marker-bounded vendoring (ADR-005) | **Exists** |
| File modifications (33 audited files, consolidating to a target ledger of ~6–8 patches — see patch policy below) | **Code-patches registry (v2)** — reinstate the removed template-patch system, with definitions externalized (see synthesis below); each patch named, precondition-matched, and loud on failure | **Reinstate + externalize** |

Patches that fix genuine canonical bugs (e.g. the `aem.js` `createOptimizedPicture` origin fix, the account-sidebar selector race) should additionally be PR'd upstream so the patch set shrinks over time rather than grows.

### Synthesis with the existing patch mechanisms

Demo Builder ends up with **one patch concept, two target domains, and externalized definitions**:

- **One concept**: a patch is `{id, target, description, precondition (search pattern), replacement}`. The engine in the extension is generic; it doesn't know any boilerplate file by name.
- **Two target domains**: *content patches* operate on DA HTML during content copy (exists today); *code patches* operate on the cloned repo's files during create/reset (v1 existed; v2 reinstates). Same definition shape — v1's `templatePatchRegistry` and today's `contentPatchRegistry` are already near-identical interfaces.
- **Externalized definitions**: code-patch definitions follow the precedent `contentPatches` already set with `ContentPatchSource` — fetched at create time from an external patches repo (today `skukla/eds-demo-content-patches` holds `citisignal/patches.json`; the same repo, or a generalized `eds-demo-patches`, gains the code-patch sets per brand). v1's payloads were **bundled in the extension** (`config/patches/*.ts`), which coupled patch lifecycle to extension releases; v2 must not repeat that.
- **Single source of truth**: per the v1 lesson, modifications to canonical code live in exactly one place — the external patch set. Never in a fork, and not duplicated between bundled and external definitions.
- **Smart-404 vendoring** (ADR-005) stays special-cased for now: it injects net-new marker-bounded snippets rather than transforming existing code, and it carries its own idempotency contract. Whether it migrates onto the v2 engine is an implementation-workstream choice, not a requirement.

### Decoupling guarantees

The question "what couples to the boilerplate?" gets a one-line answer per artifact:

| Artifact | Lives in | Coupled to canonical? |
|---|---|---|
| Patch/vendoring/install **engines** | Extension | **No** — generic; no canonical file names or content |
| Custom **blocks** + UE wiring | Block-library repos (`block-libraries.json`) | **No** — additive; canonical doesn't know they exist |
| **Content patches** | External patches repo | No — target DA content we own |
| **Code patches** | External patches repo | **Yes — and only here.** Each patch declares its coupling explicitly via its precondition; canonical drift makes the patch fail loudly at create time instead of rotting silently in a fork |
| `demo-config.json`, demo packages, stacks | Extension config | No — point at canonical's repo URL, nothing in it |

So the extension releases on its own cadence; patch sets and block libraries version independently in their repos; and the entire canonical coupling surface is enumerable by listing one directory of patch definitions.

### Patch policy: a shrinking, single-digit ledger

A patch is a **liability with an exit plan, not a customization mechanism**. The default answer to "can we patch this?" is no — additive or upstream first. Applied to the 33 audited modification files:

| Audited modifications | Consolidation | Result |
|---|---|---|
| 14 one-line import swaps (aem-assets wrapper) | Patch the vendored dropin file directly — v1's `aem-assets-sku-sanitization` already did this, "eliminating the need to patch 16+ individual block files" | 1 patch |
| 11 CSS theming files | One vendored `<link>` in `head.html` (smart-404 vendoring shape) + an additive brand stylesheet | 1 vendor point |
| 4 genuine canonical bugs (sidebar selector race, `aem.js` origin handling, header nav-tools defensiveness, SKU slash encoding) | **Upstream PRs**; patch only as carry until each PR merges, then delete | ≤4 expiring patches |
| Carousel autoplay removal | Demo preference — drop it, or propose upstream as a block option | 0 |
| Trivia (`delayed.js` comment removal, READMEs) | Drop | 0 |
| 2 fixes to demo-team blocks (product-teaser SKU-encoding portability, image-URL handling) | Code patches targeting the library-installed block, applied post-install; PRs filed to `demo-system-stores` as exits (see "Two upstreams") | 2 expiring patches |

Steady state: **~6–8 active patches**, each with a declared exit (upstream merge → delete; additive restructure → delete). New patches require justifying why neither additive nor upstream works. The exits are machine-watched, not memory-dependent: the daily gate detects when a fix has landed upstream and proposes the patch's retirement automatically (see below).

### Two upstreams, one policy

The demo team ships general-purpose blocks (the 9 audited ones, and future additions) as part of *their* boilerplate at `demo-system-stores/accs-citisignal`. Copying those blocks into a repo of our own was considered and **rejected** (2026-06-10, owner) — it recreates the sync treadmill this ADR exists to eliminate. Instead, the existing block-library mechanism consumes their repo directly, which works without modification because:

- **Discovery is dynamic**: the installer scans the source repo's `blocks/` and installs whatever it finds — a new demo-team block reaches every storefront on its next create/reset with no config change.
- **Dedup-against-destination is the firewall**: blocks already present in the storefront (i.e., everything canonical ships) are skipped, so the demo team's *modifications* to standard blocks cannot bleed in. Only their net-new blocks install.
- **Version tracking already exists**: the installer records the source commit, and the add-on update checker already surfaces "block library updates."

So Demo Builder tracks **two upstreams** — Adobe's canonical for the base storefront, the demo team's boilerplate for the block collection — under one policy:

1. **Our modifications to library-sourced blocks are code patches, by design** (owner decision 2026-06-10): any change we need to a block that comes from *any* block library is expressed as a code patch from day one — patches apply *after* block installation in the create/reset sequence, so they target installed library blocks exactly as they target canonical files. Same ledger, same gate; the daily check verifies block-targeting patches against the block-source repo. We never edit library blocks in place and never carry private copies.
2. **Upstream-first is the exit, not the gatekeeper**: each block patch files a PR to the owning upstream (`hlxsites` for canonical, `demo-system-stores` for demo-team blocks) and retires when it merges — the gate's obsolete-patch detection covers this automatically. Concretely for migration: our fork's two product-teaser fixes (SKU-encoding portability, image-URL handling) become day-one code patches with PRs filed to the demo team; **the block-source flip is not blocked on their review cadence**.
3. **Last resort for a chronically broken demo-team block** (breakage too structural for a sensible patch): shadow it with a higher-priority override library entry (library order feeds the dedup, so an earlier source wins). This is a deliberate single-block copy — the one place the copy smell is permitted, and it's visible in config rather than buried in a fork.

### Tracking canonical via a last-known-good gate

Demo Builder does **not** build from raw canonical `main`, and does **not** use a hand-maintained pin. It builds from a **last-known-good (LKG) canonical commit**, advanced by automation — the same release-engineering pattern as Chromium's LKGR or Nix channel promotion, at miniature scale:

1. **A scheduled job in the patches repo** (GitHub Actions cron — the repo holds the workflow and a small check script alongside the patch definitions) runs daily: clone canonical `main`, verify every patch's precondition still matches its target file.
2. **On success**, it publishes the verified canonical commit SHA to a `last-known-good` file on the repo's `main` — a one-line automation commit, made only when canonical moved and the patches pass (realistically a few commits per week; the history doubles as an audit log of exactly which boilerplate version storefronts received when).
3. **On failure**, it fails with a logged report — deliberately just a failing run with logs, not a notification integration (owner preference) — and the LKG pointer simply stops advancing.
4. **At create/reset time**, the extension reads `last-known-good` from the patches repo (alongside the patch definitions it already fetches) and clones canonical at that SHA. **One writer, many readers**: a hundred SCs running creates produce zero writes.
5. The same check runs on every PR to the patches repo, so a patch edit that doesn't match the real boilerplate is caught at review time.

**The gate also watches for patch retirement** (decided 2026-06-10) — it automates the patch policy's "every patch has an exit" rule instead of leaving it to memory:

- **Obsolete-patch detection.** When a patch's precondition no longer matches, the check additionally tests whether the file *already contains the patch's replacement*. If so, the fix landed upstream (near-certain when our own PR was merged verbatim) and the patch is obsolete. The job then **opens a pull request in the patches repo removing the patch**, with the evidence in the description — automation proposes retirement, a human merges it. Deliberately not auto-delete: judging whether upstream's fix is truly equivalent can be subtle, and a wrong silent deletion would break demos quietly.
- **Fixed-differently triage.** If the precondition is gone but the replacement isn't present either, upstream changed the region some other way. The check can't judge equivalence, so the logged report includes the current state of the patched region — a human decides in minutes whether to retire, rewrite, or keep the patch.
- **Touched-file FYI.** Each run logs any canonical commits since the last LKG that touched a patched file, even when all patches still apply — an early heads-up that a patch's neighborhood is changing, at zero extra cost.

Consequences of the gate:

- **Upstream drift can never block an SC.** A breaking canonical change means storefronts build from yesterday's verified boilerplate instead of today's broken-for-us one — for demo purposes, indistinguishable. The fix (a push to the patches repo) re-advances the pointer; no extension release is in the recovery path.
- **Staleness is bounded by our response time to a red canary run, not by a release treadmill.** Hand-pinning was considered and rejected (2026-06-10, owner decision): every upstream improvement would need a tested pin-bump and an extension release — the fork-sync treadmill in miniature. The LKG gate delivers pinning's safety with automation doing the bumping.
- **Loud per-patch failure at create/reset stays as a backstop** (never silently skip a patch whose precondition doesn't match), but with the gate in place it should never fire for drift — only for genuine patches-repo errors.

This works *because* the patch ledger is single-digit and targets stable anchor points; the policy above is what keeps the gate advancing near-continuously.

Our fork (`skukla/citisignal-eds-boilerplate`) is archived as a reference once Demo Builder no longer points at it — which requires the block-source flip to land first (the product-teaser fixes ride as day-one code patches, so the flip does not wait on the demo team). The demo team's `accs-citisignal` remains live in its block-source role. New canonical commits then reach every Demo Builder storefront on next reset, automatically via the last-known-good gate — the sync project (`2026-06-09-storefront-template-sync.md`) is dropped rather than executed.

### Why not the alternatives

- **Keep + sync (the gated sync project):** rejected by the numbers. We would be hand-syncing two repos to store one customization set, 30% of whose diff is itself prior sync labor. The audit's per-commit view shows ~70% "modificational" commits, but spot-checks proved that measure is dominated by merge commits, churn, and upstream catch-up mislabeled as modification — not by customizations that need a fork.
- **Drop forks with no code-patches mechanism (>85% band):** not supported by the data. 33 files of real modification exist; without a patch layer they'd be lost or smuggled back in as ad-hoc vendoring. (The patch policy above shrinks the 33 audited files to a ~6–8 patch ledger, but not to zero — slash-SKU image handling and the brand-CSS injection point can't be expressed purely additively today.)
- **Pin canonical + bundle patch definitions in the extension** (considered and rejected 2026-06-10): maximizes test atomicity (CI asserts every precondition against the pinned ref), but every upstream improvement then requires a pin-bump and an extension release, with storefronts running stale boilerplate between bumps — the fork-sync treadmill in miniature. Rejected by owner in favor of the last-known-good gate, which delivers pinning's safety with automation doing the bumping.
- **Raw HEAD with an alert-only canary** (the intermediate design, superseded same day): builds straight from canonical `main` and relies on a daily check plus loud create-time failure. Rejected because a breaking canonical change blocks SC creates/resets until a patch fix lands; the LKG gate closes that window entirely at the cost of storefronts being at most ~a day behind.

---

## What This ADR Does Not Decide

- **The implementation.** Registry format, patch application order, failure UX, migration sequencing, the `last-known-good` file format, and the create/reset failure mode when the patches repo is unreachable belong to the implementation workstream (RPTC research/plan), not this decision record.
- **buildright-eds.** Explicitly excluded from the audit (it shares no git history with canonical — it is not technically a fork). Its disposition is tracked separately in `.rptc/backlog/2026-06-10-buildright-eds-disposition.md`.
- **PDP routing.** Decided in ADR-005; cited here only as the vendoring precedent.
- **Upstream-PR sequencing.** The patch policy designates four fixes for upstream PRs; the order, timing, and what to do if a PR is declined are left to the implementation workstream.

---

## Consequences

### Positive

- **Canonical currency for free.** Every storefront picks up upstream fixes (including security guards we're currently missing) on next reset, at most about a day behind canonical `main`, with zero sync labor.
- **Upstream drift can never block an SC.** Creates/resets build from the last verified boilerplate commit; a breaking canonical change means "yesterday's boilerplate" rather than a failed create.
- **One customization store instead of two repos.** The audit showed the two forks carry one byte-identical customization set; the thin layer makes that explicit and versioned in Demo Builder config.
- **Drift becomes visible instead of silent.** A patch whose precondition no longer matches turns the daily gate red (and, as a backstop, fails loudly at create time — the `911b6ac8` "not applied — code structure changed" case), instead of silently shipping stale fork code.
- **The drop-in version coupling findings resolve.** The forks' `package.json` was a stale canonical copy, not deliberate pinning; building from current canonical removes the divergence class.

### Negative

- **A new moving part: the patches repo becomes load-bearing at create/reset time.** The extension fetches patch definitions and the last-known-good pointer at runtime; if the repo or raw.githubusercontent is unreachable, creates/resets need a defined failure mode (the same dependency already exists for external content patches). And while a canonical change keeps the canary red, the LKG pointer stops advancing — storefronts build from progressively older (but verified) boilerplate until we push the patch fix. Staleness during incidents is bounded by our response time to a logged red run, which nobody is paged about by design.
- **Behavior changes can still arrive unvetted — from either upstream.** The gate verifies that our patches *apply*, not that new behavior is demo-appropriate. A canonical change (or a demo-team block change) that breaks nothing mechanically but alters a demo flow ships to storefronts on the next create/reset. Accepted: this is what "depend on the upstream" means, and the alternative (human review of every upstream change) is the fork model again. The shadow-override escape hatch exists for a chronically broken demo-team block.
- **~5–6 patches to own** (consolidated from 33 audited modification files per the patch policy). Each is code we maintain until upstreamed or obsoleted; the upstream-PR carry patches depend on canonical maintainers' review cadence to expire.
- **Reset becomes the delivery vehicle for customization changes.** A bad patch ships to every storefront on next reset — same blast radius the sync project had, now concentrated in a smaller, testable surface.

### Neutral

- **CSS theming stays expressed as modifications.** EDS loads block CSS from fixed per-block paths, so brand theming on canonical blocks ships as append-dominant patches rather than overlay files. Acceptable; revisit only if patch churn on CSS proves high.
- **The smart-404 vendoring (ADR-005) is unchanged** — it becomes one resident of a generalized layer rather than a special case.

---

## Cross-References

- **Audit (empirical basis)**: `.rptc/research/thin-layer-storefront-evaluation/findings.md` + `prework.md`
- **Originating backlog item**: `.rptc/complete/2026-06-09-evaluate-thin-layer-storefront-model.md`
- **Dropped by this decision**: `.rptc/complete/2026-06-09-storefront-template-sync.md` (the gated sync project)
- **Successor backlog item**: `.rptc/backlog/2026-06-10-buildright-eds-disposition.md`
- **Mechanism precedents**: `src/features/eds/services/pdp404HandlerPublisher.ts` (code vendoring, ADR-005), `src/features/eds/services/contentPatchRegistry.ts` (`contentPatches` + external `ContentPatchSource`), `src/features/eds/services/blockCollectionHelpers.ts` (block install + UE merge)
- **Prior art (v1 template-patch system)**: extension commits `6026b695` (added 2026-01-20), `cfbd05ba` (CDN publish), `f6a7d029` + `06dd6549` (removed 2026-02-01) — recoverable from git history at `f6a7d029^:src/features/eds/services/templatePatchRegistry.ts` and `f6a7d029^:src/features/eds/config/patches/`
- **External patches repo**: `skukla/eds-demo-content-patches` (`citisignal/patches.json`) — the externalization precedent code patches follow
- **Related ADRs**: ADR-005 (BYOM PDP routing — vendoring precedent)
- **Fork evidence commits**: `911b6ac8` (migration of v1 patches into the fork), `907883b3` (selector fix, `citisignal-eds-boilerplate#2`), `f04fd862` (aem-assets import rewrites)
