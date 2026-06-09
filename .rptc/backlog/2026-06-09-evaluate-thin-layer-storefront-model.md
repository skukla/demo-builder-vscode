---
id: 2026-06-09-evaluate-thin-layer-storefront-model
title: Evaluate dropping storefront forks in favor of thin-layer customization via Demo Builder
status: backlog
priority: high
created: 2026-06-09
gates: 2026-06-09-storefront-template-sync
---

# Evaluate dropping storefront forks in favor of thin-layer customization

## Provenance

Surfaced 2026-06-09 during the My Account left-nav bug investigation. The sync inventory revealed three storefront-template repos under our control are substantially behind canonical Boilerplate Commerce (185, 212, and **1,541** commits behind). Filing the sync project in `2026-06-09-storefront-template-sync.md` raised a sharper architectural question: **do we need to maintain these forks at all, or could we get the same outcome by pointing Demo Builder at canonical upstream directly and applying our customizations as a thin patching layer at storefront-create time?**

**This research gates the sync project.** If the answer is "thin-layer is viable," we don't sync the forks — we retire them.

## The hypothesis to test

**Most of our customizations are additive, not modificational.** New blocks, new content, theme tokens, configuration. If that's empirically true, Demo Builder's existing patching mechanisms (`contentPatches`, block library installation, inspector tagging, feature packs) can apply them as a layer at create time — eliminating the need to maintain a forked copy of canonical code.

The opposite hypothesis: a meaningful fraction of our customizations are *modifications* to canonical Boilerplate code (e.g., the selector fix we just shipped for `commerce-account-sidebar`). Those can't be additive; they require either (a) PR'ing upstream and waiting, or (b) a new "code patches" mechanism in Demo Builder analogous to `contentPatches`.

## What the research must determine

For each of the three forks, classify every "ahead" commit (our customizations) into one of:

| Category | Definition | Thin-layer impact |
|---|---|---|
| **Additive: new block** | Adds a new directory under `blocks/` | Already supported by Demo Builder's block library installation |
| **Additive: new content/fragment** | New page or fragment in DA | Already supported by `contentSource` copy |
| **Additive: theme/CSS** | New CSS file, color/font/spacing override | Need to confirm: works as content patch or new mechanism |
| **Additive: configuration** | New JSON/YAML config (paths, redirects, metadata) | Patchable via `contentPatches` if in DA, code patch if in repo |
| **Modification: existing block** | Change to a canonical block's JS/CSS | **Hard case** — needs upstream PR or a new "code patches" mechanism |
| **Modification: infrastructure** | Change to `scripts/scripts.js`, `aem.js`, `commerce.js` | Hard case — same as above |
| **Removable** | Demo-specific changes that don't actually need to ship with the template | Drop entirely |

The output is a numeric breakdown per fork. Roughly:

- 145 citisignal commits → X additive, Y modificational, Z removable
- 119 accs-citisignal commits → similar
- 589 buildright commits → similar

## The decision matrix

| Findings | Recommended path |
|---|---|
| >85% additive (across all three forks) | **Drop the forks.** Migrate customizations into Demo Builder configuration. Retire `citisignal-eds-boilerplate`, `accs-citisignal`, `buildright-eds`. Point packages at `hlxsites/aem-boilerplate-commerce` directly. Skip the sync project entirely. |
| 60–85% additive | **Drop the forks but add a code-patches mechanism.** Most customizations migrate to additive; the remaining minority handled by a new Demo Builder layer that applies code patches at create time (similar shape to existing `contentPatches`). The selector fix we just shipped becomes a code patch instead of a fork commit. |
| <60% additive | **Keep the forks, do the sync project.** The customizations are genuinely modifying canonical code in ways that don't fit a patch model. Maintain the forks, run the sync project as scheduled. |

## What's already known

The selector fix from `skukla/citisignal-eds-boilerplate#2` (shipped 2026-06-09) is empirically a **modification** to canonical code — it changed an existing block's selector. So we already know at least one customization is in the "Modification: existing block" category. The research isn't about whether modifications exist, it's about **what proportion** they represent.

We also know — without measuring — that buildright's branding is mostly additive: new BuildRight-themed blocks, new DA content. The 589 commits ahead are probably mostly adding files, not modifying canonical ones. But this is the kind of guess the research has to validate, not the kind we should bet a strategy on.

## Method

For each repo:

1. `git log canonical/main..HEAD --name-status --format="%H %s"` — list every customization commit with the files it touched.
2. For each commit's files, classify by `blocks/<existing-block>/` (modification) vs `blocks/<new-block>/` (additive) vs `scripts/*.js` (infrastructure modification — hard case) vs DA-content paths (additive content) vs config files (case-by-case).
3. Tally and present as a spreadsheet or table per repo.
4. Spot-check 10–15 random commits per repo to confirm classification accuracy.
5. Identify the "hard case" commits explicitly — these are the ones that determine whether thin-layer is viable at all.

Estimated effort: **1 day per repo for the audit + analysis, 1 day for the synthesis**. Total ~4 days.

## What the thin-layer architecture would look like (if research validates it)

For reference — not a commitment:

- Demo Builder's `templateRepo` config points directly at `hlxsites/aem-boilerplate-commerce@main` for each package.
- At storefront create time, Demo Builder clones canonical, then applies:
  - **Block library installation** — adds our custom blocks (BuildRight-themed, citisignal-themed, etc.) into the cloned repo. Already exists.
  - **Content patches** — modifies DA content as it's copied. Already exists.
  - **Code patches** (new mechanism, if needed) — applies a curated set of edits to canonical files. Same shape as `contentPatches` but operates on the GitHub clone's code. Used for the selector fix and similar.
  - **Inspector tagging** — vendors SDK files. Already exists.
  - **Feature packs** — additive B2B etc. Already exists.

The fork repos become archived references. Their customizations live in Demo Builder configuration. New canonical commits land in every Demo Builder storefront on next reset, automatically.

## Risks of the research itself

- **Classification ambiguity** — a "branding" CSS change to an existing block could be expressed as either an additive CSS overlay or a modification of the canonical block. The classifier has to pick a convention; document it explicitly.
- **Hidden modifications** — a commit message says "add BuildRight hero block" but actually also modifies `scripts.js` to wire it in. Granular file-level inspection is necessary; commit messages aren't reliable.
- **Drop-in version coupling** — `package.json` bumps in our forks aren't pure "customization" but also aren't trivially additive. Track separately.

## What this does NOT do

- Doesn't make any architectural change. Output is a decision document.
- Doesn't commit to retiring the forks. Decision happens after research lands.
- Doesn't unblock the colleague's My Account bug — that's already fixed via `skukla/citisignal-eds-boilerplate#2` regardless of what we decide here.

## Kickoff prompt

> Conduct the audit described in `.rptc/backlog/2026-06-09-evaluate-thin-layer-storefront-model.md`. For each of the three forks (`skukla/citisignal-eds-boilerplate`, `demo-system-stores/accs-citisignal`, `skukla/buildright-eds`), classify every "ahead" commit using the categories in the file. Produce a per-repo breakdown plus a synthesis recommendation against the decision matrix. Output: `.rptc/research/thin-layer-storefront-evaluation/findings.md`.

## Related work

- **Gates**: `2026-06-09-storefront-template-sync.md` — outcome of this research determines whether the sync project happens or gets dropped.
- **Triggered by**: `skukla/citisignal-eds-boilerplate#2` (the selector fix, already merged) — the moment we realized we have a "modification of canonical code" customization, the patching-mechanism question became sharp.
