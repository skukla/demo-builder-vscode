# Patches and the pre-render on saved demo packages and third-party storefronts

Research opened 2026-09-14 for the owner's question: when an SC saves a brand to the Welcome
screen, does the saved package carry the patches that should apply? When a third-party
storefront arrives by link or zip and was built from the same boilerplate as our templates,
could we offer to apply our patches? Are the patches real fixes? Is the pre-render (BYOM PDP
overlay) used with third-party storefronts?

Branch `feature/colleague-storefront`. Read from code, the patches repository, and live
GitHub repositories; no code changed.

## 1. What a patch is, and what the ledgers hold (read 2026-09-14)

A code patch (ADR-006) is `{ id, target, description, precondition, replacement, exit,
critical }`: a named string replacement anchored on a substring that must match exactly once.
The engine (`codePatchRegistry.ts`) is pure over a `Map<path, content>` and answers per patch
with three states: applied, already present (replacement found), or not applied with a
reason (target missing, precondition missing or not unique). Targets are allowed only under
`blocks/` and `scripts/` and only `.js` (`patchTargetPolicy.ts`). Definitions live in
`skukla/eds-demo-patches` (release `v1.0.0`, 2026-08-28), read at the latest release.

Three ledgers, every entry a fix with a named exit (an upstream PR, then delete):

| Ledger (canonical) | Patches |
|---|---|
| `b2b` (`adobe-commerce/boilerplate-b2b-template`, pinned by `b2b/last-known-good`) | header nav-tools null guard; reversible SKU encoding in product links (two, ADR-007); AEM Assets SKU alias sanitising; account-sidebar selector race; account page column layout; PDP empty-data redirect to the native 404 |
| `citisignal` (hlxsites canonical) | the same first five, plus three product-teaser fixes (SKU encoding, `getProductLink` import, media URL handling) |
| `custom` (hlxsites canonical) | the two universal ones: header nav-tools guard, account-sidebar race |

So the owner's concern is met by the record: none of these is a customisation. Five are
load-bearing for what the extension does around a storefront (`loadBearingPatches.ts`):
`product-link-sku-encoding`, `product-link-sku-slash-encoding`, `product-teaser-sku-encoding`,
`pdp-empty-data-redirect`, `aem-assets-sku-sanitization`. Without them product deep links,
the smart 404 and AEM Assets images misbehave.

## 2. How patches reach a storefront today

- **A shipped brand** (CitiSignal, Bodea, …): the package's storefront entry names
  `codePatches` + `codePatchSource` + `templateOwner/Repo`. Creation generates the repo from
  the template, then `pinRepoToLkg` resets it to the ledger's last-known-good commit and
  applies the canonical-phase patches in the same commit; block-phase patches apply after
  block libraries install. Reset repeats it. Edit mode re-derives the patch fields from the
  package every run (`storefrontSetupConfigRehydration.ts`), after the 2026-07-29 incident in
  which they were lost.
- **An added demo** (a colleague's link, a zip, or the SC's OWN saved package): the card
  becomes a synthesized package (`storefrontResolver.ts`) whose storefront has
  `templateOwner/Repo` = the added repository and NO `codePatches`/`codePatchSource`. Creation
  generates from (or resets onto) that repository at its `main`. The five load-bearing patches
  run as a DRY CHECK only (`dryCheckDemo`, D23); each miss becomes a caveat on the completion
  card. Reset re-fetches their `main`. Nothing is pinned, nothing is patched. This was the
  owner's decision of 2026-09-11 (§6.4): "their `main`, report only … Rejected: opt-in
  patching (edits code the colleague changed on purpose)".

**Finding 1 — the SC's own saved package is treated as a colleague's.** "Save as demo package"
writes a description file (`describeProject`) with name, description, store codes,
config flags, mesh posture, datapack, integrations, block libraries, content source. It does
NOT record what the storefront was built from: the shipped package id, the template, the
last-known-good commit, or the patch ledger and ids. When the SC (or anyone) starts a project
from it, the storefront is an added demo: the patched files travel because they are IN the
repository, but they are frozen at the moment of saving. Later patches never arrive, the
repository is never re-pinned, and the dry check is the only thing that notices.

**Finding 2 — even our own repositories fall behind.** Live fit test (2026-09-14, the engine's
own three-state check reproduced on the ledger and the repos' `main`):

| Repository | Origin | Result for the five load-bearing + two universal patches |
|---|---|---|
| `skukla/demo-builder-test` (ours, boilerplate 6.0.0) | Demo Builder | 5 already applied; `product-teaser-sku-encoding` and `pdp-empty-data-redirect` FIT and are not applied (added to the ledger after this repo was built) |
| `sayurihanki/aistore` (Jen's, boilerplate 4.0.1) | generated from `adobe-commerce/boilerplate-b2b-template` | 5 FIT cleanly (both SKU-encoding patches, AEM Assets, header guard, sidebar race); `product-teaser-sku-encoding` and `pdp-empty-data-redirect` miss: those files diverged |

So a shipped-template storefront that is not reset stays behind the ledger, and a colleague's
storefront two boilerplate versions back still takes five of seven patches exactly.

## 3. Can we tell a storefront was built from our boilerplate?

Three signals, all available today, none used for this yet:

1. **GitHub's `template_repository`** on the repository record names the template a repo was
   generated from. `sayurihanki/aistore` → `adobe-commerce/boilerplate-b2b-template`. The
   extension already reads `is_template` and `parent` (fork) in `githubRepoOperations.ts`, not
   this field. Absent for a repository created empty and reset onto a source (our own
   `demo-builder-test` reports none) and for any fresh push, so it is a positive signal, not a
   test.
2. **`package.json` name and version.** Both canonicals are `@adobe/aem-boilerplate-commerce`;
   the B2B line is 6.x, the B2C line 10.x, and a copy says how far behind it is (aistore 4.0.1).
   Works for a zip too.
3. **The patches' own preconditions**, which is what the dry check already computes: an exact
   fit per file is the strongest evidence that the file is the boilerplate's.

Together: lineage (1 or 2) + fit (3) is enough to say "this was built from our boilerplate and
these N patches apply cleanly".

## 4. The pre-render (BYOM PDP overlay) on third-party storefronts

The overlay is package-independent. `demoBuilder.byom.enabled` (default on) and
`demoBuilder.byom.overlayUrl` (default: the team's deployed `render-pdp` action) apply to every
EDS storefront the extension sets up, added demos included; no package sets its own URL. Setup
registers the overlay for the site in the Configuration Service and installs the smart-404
snippet into the repository's `scripts/delayed.js` inside marker comments
(`pdp404HandlerPublisher.ts`), then the probe checks the overlay's source template
(`/products/default`) is published. When `delayed.js` is missing the install is skipped and a
caveat says so. Headless storefronts are out of scope for it.

Two things follow. The pre-render IS used with third-party storefronts. And "Demo Builder does
not change this storefront's code" (the wording of today's caveats) is not strictly true:
setup already writes the smart-404 snippet, block libraries, `fstab.yaml`, `config.json` and
the description file into the colleague's repository, as the owned "integration contract". The
line drawn on 2026-09-11 is between that contract and the colleague's own code.

## 5. Options, and what I recommend

**A. Record provenance in the saved package (recommended, small).** The description file gains
`builtWith: { package, template: {owner, repo}, lkg, codePatchSource, codePatches, extension }`
written from the project's resolved storefront at save time. On add, when `builtWith.template`
matches one of our canonicals and the ledger is reachable, the synthesized storefront carries
`codePatches`/`codePatchSource`/`templateOwner`/`templateRepo` from it: the SC's own saved brand
stays thin-layer, so creation pins and patches like a shipped brand and reset keeps it
current. A colleague who did not build with Demo Builder has no `builtWith`, and nothing
changes for them. Version the file (`version: 2`); readers of version 1 behave as today.

**B. Offer to apply patches that fit, opt-in, to third-party storefronts (recommended, with
the 2026-09-11 decision revisited).** The decision rejected opt-in patching because it "edits
code the colleague changed on purpose". The fit test answers that objection: a patch whose
precondition matches exactly once is landing on code the colleague did NOT change, and the
engine refuses everything else. So: when the repository shows lineage (`template_repository`
or the boilerplate package name) and one or more load-bearing or universal patches fit, the
completion card offers "Apply N Demo Builder fixes to this storefront" with the patches named
by consequence, default off, written as one commit, and repeatable on reset with the same
offer. Patches that miss stay caveats. The offer never appears for a repository that shows no
lineage. Evidence it would help today: five of seven fit on Jen's storefront.

**C. Fingerprint zips the same way.** A zip has no GitHub record; the boilerplate package name
and version plus the fit test give the same answer. The engine already runs on a file map, so
the zip's files can be tested before the repository is even created.

**D. Say what is written.** Whatever is decided, reword the caveat so it names the line the
extension already keeps: it writes the integration pieces (smart 404, block libraries,
fstab, config, description) and never the colleague's own code.

Not recommended: pinning a colleague's repository to our last-known-good (their code would
be replaced wholesale; rejected before and still wrong), or applying patches silently.

## 6. Open questions for the owner

1. Does B change the 2026-09-11 decision? The objection was "code the colleague changed on
   purpose"; the fit test only touches code they did not change. If yes, B is a small plan
   step on this branch; if no, A alone still fixes the SC's own saved packages.
2. Should a repository that shows no lineage but where a patch fits still get the offer? I
   recommend no: lineage is the gate, fit is the filter.
3. Should reset of a saved-package project re-pin to the ledger's last-known-good (like a
   shipped brand) or keep the saved repository's `main` (like a colleague's)? A recommends the
   shipped-brand behaviour, because the SC owns both ends.
