# Thin-Layer Storefront Evaluation — Audit Findings

**Question**: Do we need to maintain our storefront-template forks at all, or could we get the same outcome by pointing Demo Builder at canonical `hlxsites/aem-boilerplate-commerce` directly and applying our customizations as a thin patching layer at storefront-create time?

**Date**: 2026-06-10
**Repos audited**: `skukla/citisignal-eds-boilerplate` (146 commits ahead), `demo-system-stores/accs-citisignal` (119 commits ahead)
**Out of scope**: `buildright-eds` (excluded per user direction 2026-06-10; it has no shared git history with canonical anyway — see prework)
**Merge-bases** (from prework, not recomputed): citisignal `39b4b633`, accs `d4b49146`. Canonical HEAD at audit time: `76060194`.

## Executive summary

**Recommendation: drop the forks and add a code-patches mechanism** (the 60–85%-additive band of the decision matrix). The lineage analysis collapses the apparent 265-commit surface to 146 distinct commits — every one of accs-citisignal's 119 commits is contained in citisignal's history by SHA; citisignal adds only 27 of its own. At the file level, the real deduped customization surface is **76 files**: 30 (39%) are genuinely additive (nine new blocks plus one new script), 13 (17%) are already handled by existing Demo Builder mechanisms (UE-config merge during block install, `demo-config.json` templating) or droppable, and 33 (43%) are modifications to canonical files that need a code-patches layer — of which 24 are mechanical changes of six lines or fewer, and **none** resist the patch model (the largest is an append-heavy CSS theme file; the most complex is a ~50-line carousel rewrite). A further 32 changed files are pure upstream catch-up — copies of newer canonical content — which vanish entirely once Demo Builder clones canonical HEAD directly; the forks' "ahead" counts materially overstate customization. The clincher: the forks' own history already contains a commit literally titled "feat: apply code patches for demo compatibility" (`911b6ac8`) applying named patches by hand — the proposed mechanism would automate what fork maintenance is already doing manually.

## Method and classification conventions

Per the backlog: `git log <merge-base>..HEAD --name-status` per fork, every commit classified by file-path pattern against canonical's file tree **at the fork's merge-base**, then spot-checked with `git show` at deterministic intervals.

Two measures are reported, because they disagree and the disagreement is the most important finding of the audit:

1. **Per-commit classification** (what the backlog asked for). Distorted by three artifacts: (a) 27–33% of "ahead" commits are merge commits with no diff; (b) churn — e.g. the hero-v2 block took 7 commits (add + 6 fixes) for one additive outcome; (c) upstream catch-up — commits that copy newer canonical content into the fork path-classify as "modifications" but are not customizations.
2. **Net-file classification** (decision-relevant). The `git diff <merge-base>..HEAD` file list, with every changed file's blob compared against canonical HEAD and canonical's full blob history. This is the actual surface a thin layer would have to reproduce.

**Documented conventions** (per the backlog's classification-ambiguity risk note):

- A change inside a `blocks/<name>/` directory that exists in canonical at the merge-base = "Modification: existing block", even if the file itself is new (e.g. adding `_name.json` to a canonical block). The blob-history check then separates genuine customization from upstream catch-up.
- CSS changes to canonical files (`styles/styles.css`, canonical blocks' `.css`) are counted as **modifications**, not additive overlays — EDS loads block CSS per-block from fixed paths, so expressing them additively would itself require modifying load logic. They are, however, the most patch-friendly modification class (append-heavy; see hard cases).
- UE-config wiring (`component-definition.json`, `component-models.json`, `component-filters.json`, `models/_*.json`) riding along in a commit that adds a new block is folded into "Additive: new block". Standalone UE-config commits are tallied separately.
- A commit touching multiple categories is classified by its hardest category (mod-block > mod-infra > mod-theme > UE-config > additive).
- `package.json`/`package-lock.json` tracked separately per the backlog's drop-in version coupling note.
- No DA-content paths appeared in either fork's diff — DA content lives outside these repos, so the "Additive: new content/fragment" category is structurally empty here.

## Per-repo breakdown

### skukla/citisignal-eds-boilerplate (146 commits ahead)

Of 146 commits: **41 are merge commits** (no diff — fork-PR merges plus syncs from accs and canonical). Of the 105 substantive commits:

| Category | Commits | % of 105 |
|---|---|---|
| Additive: new block | 20 | 19.0% |
| Additive: new infra file (`scripts/aem-assets.js` etc.) | 3 | 2.9% |
| Additive: other new files (`ue/` staging folder, tools) | 6 | 5.7% |
| **Additive subtotal** | **29** | **27.6%** |
| Modification: existing block | 39 | 37.1% |
| Modification: infrastructure (`scripts/*`) | 10 | 9.5% |
| Modification: theme (`styles/styles.css`) | 4 | 3.8% |
| Modification: UE config (standalone) | 19 | 18.1% |
| Modification: other canonical files | 2 | 1.9% |
| **Modificational subtotal** | **74** | **70.5%** |
| Removable/cleanup (README, deletions of fork-only files) | 2 | 1.9% |

**Net-file view** (108 files changed vs merge-base, blob-compared against canonical):

| Verdict | Files | Meaning |
|---|---|---|
| Identical to canonical HEAD | 29 | Upstream catch-up (the 30-file `_*.json` metadata sync `fd22f912`, minus one that drifted) — **not customization** |
| Identical to an older canonical blob | 3 | Stale upstream copies: `package.json`, `package-lock.json`, `_product-list-page.json` — **not customization** (this also resolves the drop-in version coupling risk: the fork's `package.json` is a verbatim old canonical version, not custom pinning) |
| Not in canonical HEAD (genuinely additive) | 30 | 9 new blocks — embed, form, hero-v2, product-teaser, quote, search, table, tabs, video (26 files) — plus `scripts/aem-assets.js` and 3 block READMEs |
| Truly custom (differs from every canonical version) | 46 | The real modification surface — broken down under hard cases |

The 46 truly-custom files: 11 CSS theming files, 18 block JS files (13 of which are one-line import swaps from a single commit), 4 `scripts/` infra files, 10 UE-config JSON files, `demo-config.json`, and 2 READMEs.

**Hard-case commits** (citisignal-unique; the rest of its modifications are inherited — see lineage):

| SHA | What it touches | Why it resists additive patterns |
|---|---|---|
| `907883b3` | `commerce-account-sidebar.js` (+11/−1) | The known selector fix (fork PR #2) — defensive guard inside a canonical block's logic. The backlog's founding example. |
| `f04fd862` | 15 blocks + `initializers/pdp.js` (one line each) + extends `scripts/aem-assets.js` | Swaps `@dropins/tools/lib/aem/assets.js` imports for a sanitizing wrapper. The wrapper itself is additive; the 15 import rewrites are mechanical one-line modifications to canonical files (sed-shaped). |
| `7868a61c` / `99cec109` | `scripts/commerce.js` (+18/−4 net) | SKU slash-encoding (`/` ↔ `__`) in `getProductLink`/`getSkuFromUrl` — changes existing logic in core commerce infra. |
| `911b6ac8` | `header.js` (+11), `scripts/commerce.js`, vendored dropin file | **Literally titled "feat: apply code patches for demo compatibility"** — applies three named patches (header-nav-tools-defensive, aem-assets-sku-sanitization, product-link-sku-encoding) by hand. The code-patch model is already in operational use on this fork. |
| `86feeabe` / `358f13ef` | 5 canonical blocks' `_*.json` + `component-definition.json` | unsafeHTML flags for doc-page auto-generation — JSON-level edits to canonical block definitions (JSON-mergeable). |
| `11865d86` | `scripts/initializers/personalization.js` (+29/−2) | Auth guard — **net-reverted** (file matches merge-base at HEAD; superseded by a later canonical sync). An example of fork churn that a patch layer would never have carried. |

Also notable: 10 of citisignal's 27 unique commits are the demo-inspector integration **and its complete removal** (`9a088c46` … `58ce82bb`, the last titled "tagging now handled by Demo Builder") — net-zero surface, and direct precedent for migrating fork functionality into Demo Builder.

### demo-system-stores/accs-citisignal (119 commits ahead)

Of 119 commits: **39 are merge commits**. Of the 80 substantive commits:

| Category | Commits | % of 80 |
|---|---|---|
| Additive: new block | 18 | 22.5% |
| Additive: other new files (`ue/` staging folder, hooks) | 4 | 5.0% |
| **Additive subtotal** | **22** | **27.5%** |
| Modification: existing block | 25 | 31.3% |
| Modification: infrastructure | 8 | 10.0% |
| Modification: theme | 4 | 5.0% |
| Modification: UE config (standalone) | 18 | 22.5% |
| Modification: other | 2 | 2.5% |
| **Modificational subtotal** | **57** | **71.3%** |
| Removable/cleanup | 1 | 1.3% |

**Net-file view** (57 files changed vs merge-base):

| Verdict | Files |
|---|---|
| Identical to canonical HEAD (catch-up: 7 block `_*.json` + `scripts/ue.js`) | 8 |
| Genuinely additive (the **same 9 new blocks** as citisignal, 27 files) | 27 |
| Truly custom | 22 |

The 22 truly-custom files are a **strict subset of citisignal's 46**, with identical per-file diff stats — confirming citisignal carries accs's customizations unmodified. They are: 12 CSS theming files (`product-details.css` +236/−10, `carousel.css` +119/−114, `product-recommendations.css` +72/−0, `styles.css` +30/−28, etc.), 1 block JS (`carousel.js` +28/−48), `scripts/aem.js` (+6/−6), 5 UE-config files, `demo-config.json`, `_product-recommendations.json`, and 2 READMEs.

**Hard-case commits** (these originate in accs and are inherited by citisignal):

| SHA (accs) | What it touches | Why it resists additive patterns |
|---|---|---|
| `8278caea` + related carousel commits | `blocks/carousel/carousel.js` (+28/−48 net) | Removes autoplay and restructures event binding — a behavioral rewrite of a canonical block, the largest JS modification in either fork. Patchable, but the patch must track canonical's carousel if it evolves. |
| (image-fix branch, merged `806e04da`) | `scripts/aem.js` (+6/−6) | `createOptimizedPicture` rewritten to carry absolute origins — changes existing logic in EDS core infra. Candidate for an upstream PR. |
| `c62475c1` / `93bde25f` | `styles/styles.css` + UE section models | Brand tokens interleaved with structural tweaks (link font rule removed, icon size changed) — modification, though append-dominant. |
| Multiple ("Section properties fix", "Quote fix", "UE related changes") | root `component-*.json`, `models/_*.json` | UE wiring diverged from canonical's equivalents. Note `e76fcac4` *added* these files before canonical had them; canonical later added its own. JSON-mergeable. |

### Spot-check log (deterministic intervals)

**citisignal** — every 10th commit, 15 samples: `907883b3` mod-block ✓; `fd22f912` path-classified mod-block ×30 — **misclassification by path rule**: blob-identical upstream catch-up (corrected by net-file analysis); `f2dd6964` add-block ✓ (hero-v2 churn); `34fe49e3` merge (canonical sync); `c3fa144d` ue-config — also upstream catch-up ("missing changes from upstream"); `f473c2e2` mod-block ✓ (`product-recommendations.js` + `ue/scripts/ue.js`); `bed29223` add-block ✓ (quote); `6ab63e11` ue-config ✓; `cbb5f4ca`, `45ef2735` merges; `db161c91` mod-block ✓ — note commit message says "Store Switcher fix" but touches `footer.css` (confirms backlog's warning that messages are unreliable); `68ebb4f9` removable ✓ (README); `16f559e0` mod-block ✓; `1df1a2a8` ue-config ✓; `5b736511` add-other ✓ (`ue/` folder, 20 files, later deleted — absent from net diff).

**accs** — every 8th commit, 15 samples: `12977aa1`, `067ff0d3`, `b75a8ae5`, `ad4d8c63`, `806e04da`, `c4051eb6`, `1e6b5a04` merges; `fd484858` add-block ✓; `ddbb7458` ue-config ✓; `c62475c1`, `93bde25f` mod-theme ✓; `3a9485e9` mod-block ✓ (lint); `8278caea` mod-block ✓ (carousel); `e9cf229b` add-block ✓ (product-teaser, 8 files incl. UE wiring — folded additive ✓); `e76fcac4` ue-config — mixed commit (pre-commit hooks + first add of root UE configs + pkg), classification defensible but noted.

Misclassification rate: 2 of 30 samples (both upstream-catch-up commits counted as modifications by the path rule). The blob-level net-file analysis systematically corrects exactly this error class, which is why the net-file percentages — not the per-commit ones — feed the recommendation.

## Lineage analysis

`citisignal-eds-boilerplate` was forked from `accs-citisignal` (its `upstream` remote), not from canonical. Verified by SHA reachability (stronger than the patch-id matching the method suggested — the commits are literally the same objects, merged wholesale):

- `git rev-list --count 39b4b633..HEAD` = **146**
- `git rev-list --count 39b4b633..HEAD --not upstream/main` = **27** (25 non-merge + 2 merges)
- Inherited from accs-citisignal: **146 − 27 = 119 — exactly accs's entire ahead-set**

So citisignal = accs + 27 commits. **The deduped customization total is 146 distinct commits, not 265.** And of citisignal's 27 unique commits, 10 are the demo-inspector add-then-remove cycle (net zero), 2 are upstream syncs, 2 are lint fixes — leaving ~13 commits of real citisignal-only customization, dominated by the aem-assets/SKU-encoding patch family and the sidebar selector fix.

`git cherry upstream/main HEAD 39b4b633` confirms: all 25 unique non-merge commits report `+` (no patch-equivalent in accs), and zero inherited commits surface (they're excluded by reachability, i.e. identical SHAs).

Consequence for the decision: **there is essentially one customization surface, not two.** Accs's net surface (49 customization files) is a strict subset of citisignal's (76), with byte-identical content on every shared file. "Both forks" agree because one contains the other.

## Cross-cutting findings

**Repeated across both forks (strongest candidates for centralized Demo Builder mechanisms):**

1. **The same 9 new blocks** (embed, form, hero-v2, product-teaser, quote, search, table, tabs, video) — pure block-library material. Demo Builder's block installation already exists and already merges UE config (`blockCollectionHelpers.ts` builds merged `component-definition.json`, `component-filters.json`, `component-models.json` from all sources).
2. **CSS theming** of canonical blocks + `styles/styles.css` brand tokens (12 files, identical in both forks). Append-dominant (e.g. `product-details.css` +236/−10, `columns.css` +39/−0).
3. **UE-config divergence** on root `component-*.json` / `models/_*.json` — JSON-mergeable, largely a consequence of registering the custom blocks.
4. **`demo-config.json`** — per-demo Commerce endpoints/store codes. Demo Builder already owns this class of config at create time.
5. **Two small infra modifications**: `scripts/aem.js` origin fix (+6/−6) and the `carousel.js` rewrite (+28/−48).

**Unique to citisignal:** the aem-assets sanitization family (additive wrapper + 15 one-line import swaps), SKU slash-encoding in `scripts/commerce.js`, the sidebar selector fix, unsafeHTML UE flags, demo-inspector lifecycle (net-removed).

**Unique to accs:** nothing — its surface is fully contained in citisignal's.

**Comparison to the smart-404 vendoring precedent** (`pdp404HandlerPublisher.ts`, ADR-005): the precedent vendors marker-bounded snippets into canonical files (`delayed.js`, `head.html`, `404.html`) at create time, idempotently, with "already installed" detection — i.e., Demo Builder already modifies canonical code as a layer, in production, today. Every hard case found in this audit is the **same shape or simpler**: one-line import rewrites, a ≤12-line defensive guard, a ≤20-line logic substitution, appended CSS. Nothing found requires structural rewrites of canonical files beyond what the 499-line publisher already demonstrates. Additionally, fork commit `911b6ac8` shows the maintainer already thinks in named, reusable code patches — three applied, two explicitly skipped with reasons ("code structure changed") — which is precisely the failure mode a mechanized patch layer must surface (patch-no-longer-applies → flag, don't silently drift).

## Recommendation

**Drop the forks and add a code-patches mechanism** — the decision matrix's 60–85% band.

The honest numbers, on the deduped net surface (citisignal's 108 changed files, which contain accs's entirely):

- 32 files (30%) are upstream catch-up — they cease to exist the moment Demo Builder clones canonical HEAD. This is sync labor the forks force us to do, not value they store.
- 30 files (28%) are genuinely additive — already supported (block library + UE-config merge).
- 13 files (12%) are modifications already covered by existing mechanisms or droppable: 10 UE-wiring JSONs (merged by block install), `demo-config.json` (Demo Builder-managed), 2 READMEs.
- 33 files (30%) are modifications to canonical code that need the new code-patches layer: 11 CSS files, 18 block-JS files (13 of them single-line import swaps from one commit), 4 `scripts/` files.

That is **70% of the surface handled by existing mechanisms or eliminated outright**, and 30% requiring the new layer — squarely "drop the forks but add a code-patches mechanism." The raw per-commit additive share (~28% in both forks) would naively read as "<60% → keep the forks," but that measure is dominated by merge commits, churn, and upstream catch-up mislabeled as modification; the spot checks documented this distortion concretely. By the surface a thin layer must actually reproduce, no single customization resists the patch model — the binding constraint is patch count (~33 file-patches, 24 of them ≤6 lines), not patch difficulty.

Two factors push decisively away from "keep + sync": (1) both forks are 185–212 commits behind, and 30% of their diff is *already* manual catch-up labor; (2) the deduped analysis shows we'd be maintaining two forks to store one customization set.

## Implementation sketch (drop path)

The mechanism already exists in one instance: `pdp404HandlerPublisher.ts` vendors marker-bounded code into canonical `delayed.js`/`head.html`/`404.html` at create time, idempotently. A generalized "code patches" layer is an extension of that pattern, not a new invention — the same shape as `contentPatches` (registry in `contentPatchRegistry.ts`) but operating on the cloned repo's code.

Sketch: a `codePatches` registry keyed by patch name (mirroring `911b6ac8`'s naming: `aem-assets-sku-sanitization`, `header-nav-tools-defensive`, `account-sidebar-selector-race`, …), each entry declaring target file, match precondition, and transform (unified diff or anchored string replacement). At storefront create: clone canonical HEAD → install block library (9 blocks + UE merge — exists) → write `demo-config.json` (exists) → apply code patches, failing loudly per-patch when the precondition no longer matches (the `911b6ac8` "not applied — code structure changed" case becomes a surfaced warning instead of silent fork drift) → vendor smart-404 (exists). The 13 import swaps collapse to one patch ("rewrite `@dropins/.../assets.js` imports → `scripts/aem-assets.js`"); CSS theming ships as append patches or as a per-brand theme file set. Candidates like the `aem.js` origin fix should additionally be PR'd upstream so patches retire over time. Fork repos archive as references. Details belong to ADR-006.

## What this does NOT decide

- **The implementation itself** — separate workstream; ADR-006 if the drop path is confirmed.
- **Anything about buildright-eds** — explicitly excluded; it isn't a git fork of canonical at all, so this audit's method wouldn't transfer anyway.
- **The PDP routing architecture** — already decided in ADR-005; the smart-404 vendoring is cited here only as mechanism precedent.
- **Whether/when to retire the forks** — that decision happens after this research lands, per the backlog.

## Sources

- Backlog: `.rptc/backlog/2026-06-09-evaluate-thin-layer-storefront-model.md`
- Prework: `.rptc/research/thin-layer-storefront-evaluation/prework.md`
- Precedent context: `.rptc/research/eds-pdp-routing-validation/findings.md`, `docs/architecture/adr/005-byom-pdp-routing.md`
- Repos audited: `~/thin-layer-audit/citisignal-eds-boilerplate` (`39b4b633..HEAD`, 146 commits, 108-file net diff), `~/thin-layer-audit/accs-citisignal` (`d4b49146..HEAD`, 119 commits, 57-file net diff), blob comparisons against `canonical/main` (`76060194`) and its full per-file history
- Demo Builder mechanism verification: `src/features/eds/services/blockCollectionHelpers.ts` (UE-config merge, lines 120/227), `src/features/eds/services/contentPatchRegistry.ts`, `src/features/eds/services/pdp404HandlerPublisher.ts` (marker-bounded vendoring)
- Spot-checked SHAs — citisignal (15): `907883b3`, `fd22f912`, `f2dd6964`, `34fe49e3`, `c3fa144d`, `f473c2e2`, `bed29223`, `6ab63e11`, `cbb5f4ca`, `45ef2735`, `db161c91`, `68ebb4f9`, `16f559e0`, `1df1a2a8`, `5b736511`; accs (15): `12977aa1`, `fd484858`, `067ff0d3`, `b75a8ae5`, `ad4d8c63`, `ddbb7458`, `c62475c1`, `93bde25f`, `806e04da`, `3a9485e9`, `8278caea`, `c4051eb6`, `1e6b5a04`, `e9cf229b`, `e76fcac4` (classifications in spot-check log above)
- Additional deep-read commits: `f04fd862`, `911b6ac8`, `7868a61c`, `99cec109`, `86feeabe`, `11865d86`, `9a088c46`–`58ce82bb` (demo-inspector cycle)

---

## Addendum 2026-06-10 — prior art correction (post-confirmation)

After the owner confirmed the recommendation, a follow-up question ("don't we already have a code patches repository?") prompted a deeper check. Two facts correct/extend this document:

1. **The code-patches mechanism is prior art, not a proposal.** The extension shipped a full template-patch system on 2026-01-20 (`6026b695`: `templatePatchRegistry.ts` + `config/template-patches.json` + `config/patches/{id}.ts` payloads, wired through a `patches` field in `demo-packages.json`), published patched code to the live CDN (`cfbd05ba`, 2026-01-29), and removed it on 2026-02-01 (`f6a7d029`: "over-engineered for issues now fixed in the template"). This *strengthens* the recommendation — the mechanism ran in production; its removal rationale ("fixed in the template") only holds while a fork exists to bake fixes into.

2. **Corrected reading of fork commit `911b6ac8`** ("feat: apply code patches for demo compatibility", 2026-01-29). This document characterized it as the maintainer manually practicing code patches. It is more precisely the **migration of the v1 extension patches into the fork** — its five named patches are exactly the five v1 patch IDs, applied two days before the extension system was deleted. The causality: extension patches existed first → were baked into the fork → the extension layer was removed as redundant. ADR-006 inverts this: the fork is retired, so the patch layer is reinstated as the single source of truth.

3. **An external patches repo already exists**: `skukla/eds-demo-content-patches` (`citisignal/patches.json`), consumed at create time by `contentPatchRegistry.ts` via `ContentPatchSource`. It currently holds content patches only; it (or a generalized successor) is the natural home for externalized code-patch definitions — v1's one structural flaw was bundling payloads inside the extension.

The recommendation is unchanged. ADR-006 records the prior art, the synthesis (one patch concept, two target domains, externalized definitions), and the decoupling guarantees.
