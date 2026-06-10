---
id: 2026-06-09-storefront-template-sync
title: Sync storefront templates with canonical Boilerplate Commerce upstream
status: dropped
created: 2026-06-09
resolved: 2026-06-10
priority: medium
gated-by: 2026-06-09-evaluate-thin-layer-storefront-model
---

# Sync storefront templates with canonical Boilerplate Commerce upstream

> **DROPPED 2026-06-10.** The gating research concluded the citisignal forks should be retired in favor of thin-layer customization (audit: `.rptc/research/thin-layer-storefront-evaluation/findings.md`; decision: ADR-006). Phases 1–2 (cherry-pick syncs of the two citisignal repos) are therefore moot — we'd be syncing repos we're retiring. Phase 3 (buildright fresh-fork) was outside the audit's scope; buildright's disposition is tracked separately in `.rptc/backlog/2026-06-10-buildright-eds-disposition.md`. The drift inventory and per-repo strategy analysis below are preserved for reference.
>
> Original gate note: do not start this work until `2026-06-09-evaluate-thin-layer-storefront-model.md` has been completed. If that research concludes the forks should be retired in favor of a thin-layer Demo Builder customization model, this sync project becomes irrelevant — we'd be syncing repos we're about to drop.

## Provenance

Surfaced during investigation of the My Account left-nav bug a colleague reported (2026-06-09). The investigation showed the sidebar block code in `skukla/citisignal-eds-boilerplate` was byte-identical to Adobe's canonical `hlxsites/aem-boilerplate-commerce` — meaning the bug existed upstream too and a sync wouldn't fix it. The immediate fix shipped as PR #2 on that repo (selector race fix).

But the same investigation incidentally revealed substantial drift from canonical in **three** storefront-template repos under our control. None of the drift relates to the My Account bug. It's accumulated divergence from Adobe's master Boilerplate Commerce since each fork was created. This backlog item is for the broader sync work the drift indicates we should do.

## Drift inventory (measured 2026-06-09)

| Repo | Commits ahead of canonical | Commits behind canonical | Immediate parent |
|---|---|---|---|
| `skukla/citisignal-eds-boilerplate` | 145 | 185 | `demo-system-stores/accs-citisignal` |
| `demo-system-stores/accs-citisignal` | 119 | 212 | (no parent — standalone) |
| `skukla/buildright-eds` | **589** | **1,541** | (no parent — standalone) |

Canonical reference: `hlxsites/aem-boilerplate-commerce` on the `main` branch.

The "ahead" commits are our customizations (branding, demo-specific blocks, configuration). The "behind" commits are upstream improvements we don't have: bug fixes, security patches, drop-in version bumps, new features, refactors.

## Why this matters

1. **Latent bugs.** The My Account selector race we just fixed sat undetected for months. There are almost certainly others — upstream commits we don't have probably include bug fixes that would have prevented issues we'll hit later or are hitting now without recognizing them.
2. **Security drift.** Among the citisignal-eds-boilerplate diffs already observed during the investigation: upstream added a `path.startsWith('//')` guard to `loadFragment` that we don't have. Probably more such guards in 185–1,541 commits we haven't reviewed.
3. **Drop-in version compatibility.** The Commerce drop-in packages (`@dropins/storefront-account`, etc.) evolve. Our forks may eventually pin against versions that don't ship the methods our code calls.
4. **Compounding cost.** Every month we don't sync, the gap grows. A 1,541-commit-behind state today is a 2,500-commit gap a year from now — at some point a full sync stops being feasible and "fresh fork + reapply customizations" becomes the only practical path.

## Goal

Bring all three storefront-template repos to a controlled, known-current state relative to canonical Boilerplate Commerce, **without breaking our customizations**, and establish a maintenance cadence that prevents the gap from re-accumulating.

## Scope and non-goals

**In scope:**
- The three repos in the drift inventory above.
- Auditing the "behind" commits to identify what we need vs. what's safe to skip.
- Resolving conflicts between our customizations and incoming upstream changes.
- Verifying each storefront still builds and demos correctly post-sync.
- Coordinating with Demo Builder — existing storefronts pick up template changes on reset, so a broken template breaks every downstream storefront's next reset.

**Out of scope (for this backlog item):**
- Adobe-owned templates we don't control (`hlxsites/aem-boilerplate-commerce` itself, `adobe-commerce/boilerplate-b2b-template`, `stephen-garner-adobe/isle5`). PR upstream fixes when warranted; otherwise leave.
- The unrelated upstream commit-message-style PR-upstream-fix work (e.g., the sidebar selector fix going back to canonical) — that's a separate, smaller workstream.
- Any structural redesign of how Demo Builder selects/copies templates.

## Per-repo strategy options

For each repo, three broadly different approaches with very different effort and risk profiles:

| Strategy | Effort | Risk to our customizations | When it makes sense |
|---|---|---|---|
| **A. Full merge** — `git merge canonical/main`, resolve conflicts | Lowest if conflicts are few; explodes if many | High — automated conflict resolution can drop or scramble customizations | Drift is small and conflicts are localized |
| **B. Cherry-pick selected commits** — audit upstream commits, pick only the ones we want | Moderate per-commit, scales with audit depth | Lower — we explicitly accept each change | Drift is moderate, customizations are valuable and worth preserving granularly |
| **C. Fresh fork + reapply customizations** — start from current canonical, replay our 145–589 customization commits via cherry-pick or manual reapplication | Highest upfront, but predictable | Lowest if our customizations are well-isolated; highest if they're scattered | Drift is so large that A or B is impractical |

Recommended per-repo:

| Repo | Recommended strategy | Reason |
|---|---|---|
| `skukla/citisignal-eds-boilerplate` | **B (cherry-pick)** | 185 commits behind is auditable; 145 customization commits worth keeping granularly. |
| `demo-system-stores/accs-citisignal` | **B (cherry-pick)** | Similar to citisignal-eds-boilerplate; coordinate the two together since they share content. |
| `skukla/buildright-eds` | **C (fresh fork)** | 1,541 commits behind is past the threshold where audit becomes infeasible. Buildright's customizations are mostly branded blocks + content; reapplying them onto a fresh fork is likely faster than auditing 1,500 commits. |

## Execution plan

Phase by repo, starting with the smallest drift (citisignal) as the playbook for the others. Each repo gets its own pass.

### Phase 1: citisignal-eds-boilerplate (playbook)

1. **Audit** — enumerate the 185 upstream commits. Categorize each:
   - **Must take**: security fixes, bug fixes with reproducible impact, drop-in version bumps required by package.json updates.
   - **Should take**: bug fixes without clear demo-side impact, performance improvements, code quality fixes.
   - **Conditional**: feature additions (depends on whether we want the feature exposed).
   - **Skip**: documentation-only changes that don't affect runtime, demo-specific changes for the Adobe demo storefront that wouldn't apply to ours, branding-related changes upstream made for their reference site.
2. **Conflict scan** — run a `git merge --no-commit canonical/main` in a throwaway branch to list files that would conflict with our customizations. Categorize conflicts: customization-bearing (handle carefully) vs. accidental (resolve cleanly).
3. **Cherry-pick** the "must take" + "should take" commits onto a sync branch. Resolve conflicts file-by-file, preserving our customizations.
4. **Verify** — local build, `npm install`, run the storefront, demo flows (home, PLP, PDP, cart, checkout, login, My Account dashboard). Test against a fresh Demo Builder-created storefront from this template.
5. **Coordinate the demo-system-stores side** — content references in the GitHub repo and DA need to stay aligned. May require simultaneous sync on `demo-system-stores/accs-citisignal`.
6. **Merge** to `main` and announce in the team channel so anyone with active Demo Builder storefronts knows to reset.

Estimated effort: **2–3 days** (most of it in steps 1, 3, 4).

### Phase 2: demo-system-stores/accs-citisignal

Same playbook as Phase 1. Likely shares many commits with citisignal-eds-boilerplate — those can be batched. Estimated effort: **1–2 days** if done immediately after Phase 1 (cherry-pick decisions transfer).

### Phase 3: buildright-eds

Switch strategy to **C (fresh fork)**:

1. **Inventory our customizations** — what blocks did we add? What CSS theme? What demo content references the repo? What's in `scripts/initializers/`?
2. **Fork from current canonical** `hlxsites/aem-boilerplate-commerce@main`, rename to `buildright-eds-v2` (or keep the name and rename the old one to `buildright-eds-archive`).
3. **Reapply customizations** as a series of clean commits on the new fork.
4. **Verify and switch** Demo Builder's pointer to the new repo. (`block-libraries.json` and `demo-packages.json` reference `skukla/buildright-eds`.)
5. **Archive** the old repo for reference.

Estimated effort: **3–5 days** depending on how scattered the customizations are.

### Phase 4: maintenance cadence

Establish a quarterly sync schedule so the gap doesn't re-accumulate. Each quarter, run a single-day audit on each repo using the playbook from Phase 1.

## Risks

- **Demo Builder downstream impact.** Every existing Demo-Builder-created storefront based on these templates picks up sync changes on next reset. A bad sync breaks every demo. Mitigation: verify thoroughly on a freshly-created Demo Builder storefront before merging the sync to `main`.
- **Drop-in version coupling.** Upstream commits may bump `@dropins/storefront-*` package versions in `package.json`. Those versions need to be compatible with our customization code. Audit drop-in version bumps carefully.
- **Content/code coupling on citisignal.** `skukla/citisignal-eds-boilerplate` (code) and `demo-system-stores/accs-citisignal` (content) are paired. Syncing one without the other could break a content reference. Plan to do both together.
- **Buildright fresh-fork reidentification.** If we rename or replace the repo, Demo Builder's config (`block-libraries.json`, `demo-packages.json`) needs updating. Coordinate carefully.

## Kickoff prompt

When this gets picked up, the starting context is:

> Sync `skukla/citisignal-eds-boilerplate` with canonical `hlxsites/aem-boilerplate-commerce`. Current state: 185 commits behind, 145 commits ahead. Strategy: cherry-pick (Strategy B in `.rptc/backlog/2026-06-09-storefront-template-sync.md`). Start with the audit step from the playbook in Phase 1. Output: a `sync/2026-Qx` branch on the citisignal-eds-boilerplate repo with the curated cherry-picks, ready for verification and review.

## Related work

- `skukla/citisignal-eds-boilerplate#2` — selector race fix that triggered this audit (separate, narrower scope, already in flight).
- `.rptc/backlog/2026-06-09-jest-worker-force-exit.md` — unrelated, but same date.
- Demo Builder's `block-libraries.json` and `demo-packages.json` — what changes if we rename a buildright repo.
