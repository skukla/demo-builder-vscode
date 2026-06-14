# B2B feature pack — dropins never reach the browser (research → focused completion)

**Filed:** 2026-06-12 · **Status:** RESOLVED 2026-06-12 — superseded by a different design · **Priority:** HIGH — owner needed working B2B today

> ## Resolution (2026-06-12)
>
> **Shipped via the opposite design — the additive approach below was retired.** A spike
> proved `@dropins/*` ship as one coordinated release set sharing internal chunks
> (`tools/chunks/preact-vendor.js`); overlaying current-line b2b dropins onto the older
> citisignal base produces a missing-chunk blank page. Dropins are a **base** concern, not an
> overlay. So instead of vendoring b2b dropins onto a non-b2b base, we:
>
> 1. **Added a `citisignal-b2b` package** that brands the coherent `boilerplate-b2b-template`
>    base with the CitiSignal block library + content overlay (commit `134e0003`). Validated
>    live on `new-citisignal`: dropins load (`preact-vendor.js` 200, all 6 b2b dropins + import
>    map present), b2b features work, CitiSignal branding renders.
> 2. **Removed the feature-pack mechanism entirely** (commit `49b3d6d1`, −1552 lines) — it was
>    the disproven additive path and `b2b-commerce` was its only pack.
>
> Patch ledger: `eds-demo-patches@citisignal-b2b` (`2c78fd9`). Merged to develop in `8d48c17f`.
> The original additive design and research below are kept for the historical record.

## Provenance

Surfaced while investigating the MCP MODULE_NOT_FOUND bug on `citisignal-b2b` (see
`.rptc/plans/` MCP isolated-install fix + `reference_aemlive_path_encoding` memory). Tracing why
the storefront had no `node_modules` led to the b2b feature pack, and from there to the discovery
that **the b2b feature pack does not actually deliver working dropins to the storefront's runtime.**

## The problem (evidence)

EDS loads dropins at runtime via an **import map → vendored `scripts/__dropins__/<dropin>/` files**
(committed in the repo, served at the edge by Helix). `node_modules` is NOT used at runtime.

The user's `citisignal-b2b` storefront shows the feature pack delivered a broken/partial b2b layer:
- **0 of 6 b2b `scripts/__dropins__/` vendored** (the runtime code is absent)
- **head.html import map has no b2b entries** (only the 11 base dropins)
- **only 1 of 6 b2b initializers present** (`company.js`; missing company-switcher, purchase-order, quick-order, quote-management, requisition-list)
- **`package.json` b2b deps use stale/renamed names** that 404 on npm (`storefront-account-b2b`, `storefront-purchase-orders`, `storefront-quotes`, `storefront-requisition-lists`) — the current `feature-packs.json` uses the correct published names (`storefront-company-management`, `storefront-purchase-order`, `storefront-quote-management`, `storefront-requisition-list`, `storefront-quick-order`, `storefront-company-switcher` — all published on npm).

`featurePackInstaller.ts` installs blocks + initializers + merges `package.json` deps. It does NOT
vendor `__dropins__` or touch the import map, and the `FeaturePack` schema (`src/types/featurePacks.ts`)
has no field for either.

## How dropins are actually delivered (the "proper way")

The canonical mechanism is a **storefront build hook, not a git-copy**:

```jsonc
// storefront package.json
"postinstall": "npm run install:dropins",
"postupdate": "npm run install:dropins",
"install:dropins": "node build.mjs && node postinstall.js"
```

`npm install`/`npm update` triggers `build.mjs`, which reads the `@dropins/*` deps from `package.json`,
copies them from `node_modules` into `scripts/__dropins__/<dropin>/`, and wires the import map. The
base dropins are committed because that build ran and the output was committed.

So adding a dropin to a storefront = **(1)** add the published `@dropins/*` dep to `package.json` →
**(2)** `npm install` (postinstall vendors it into `__dropins__` + updates the import map) → **(3)**
commit the generated `scripts/__dropins__/<dropin>/` + `head.html` to the storefront's GitHub repo
(Helix serves from GitHub, so the generated files MUST be committed) → **(4)** add the initializer.

The current feature pack does step 1 (with, until recently, wrong dep names) and the initializers,
but never reliably does steps 2–3 — and the demo builder's storefront `npm install` aborts when any
dep is unpublished, so `postinstall` never runs.

## Why the MCP fix doesn't cover this

The MCP isolated-install fix (shipped separately) makes AI tooling robust regardless of the
storefront's `npm install`. It does NOT make b2b dropins load — that needs the build-and-commit
delivery above. Different problem.

## Goal / Scope (focused completion, after research)

Make the b2b feature pack (and the feature-pack mechanism generally) deliver dropins that actually
load: correct published deps → run the dropin build → commit the generated `__dropins__` + import map
+ all initializers to the storefront repo.

## Research questions — ANSWERED (research pass 2026-06-12, all HIGH confidence unless noted)

1. **Canonical delivery:** Adobe's mechanism = npm + TWO committed edits. `postinstall.js` *copies*
   `node_modules/@dropins/X` → `scripts/__dropins__/X/` (only if X is in `dependencies`); `build.mjs`
   does GraphQL fragment patching ONLY (it does **not** write the import map); the `head.html`
   import-map entry (`@dropins/storefront-X/` → `/scripts/__dropins__/storefront-X/`) is
   **hand-maintained**. Proof: `main` and `b2b` branches have byte-identical build scripts, but
   `b2b/head.html` carries 6 hand-added import-map entries. No `aio`/`aem` CLI for this.
2. **Commit path:** our pipeline writes to the storefront GitHub repo via the **Git Tree API**
   (`githubFileOperations` `createTree`→`createCommit`→`updateBranchRef`), never `git push`. The
   local `npm install`'s `postinstall` build vendors `__dropins__` into the LOCAL clone, but that
   output is **never pushed** during create/reset (only user-triggered Sync Storefront would). Base
   dropins reach the edge only because the canonical template commits them upstream and `/generate`
   (or the zipball reset) copies the whole tree.
3. **Pipeline placement:** inside `installFeaturePacks` (`featurePackInstaller.ts`), folded into the
   atomic Git-Tree commit it already builds (called from `storefrontSetupPhase2.ts:99`). Reuse the
   `installBlockCollections` subtree-copy pattern (`listRepoFiles` + `getBlobContent` from
   `source@b2b`). **The MCP isolated-install pattern does NOT transfer** (different destination —
   committed GitHub repo, not local `node_modules`; the build is redundant since the b2b dropins are
   pre-built + committed on the `b2b` branch). Keep the MCP fix as-is.
4. **Schema/installer changes:** add one additive field — `dropins?: { install: boolean;
   sourceDir?: string; names: string[] }`. Import-map keys derive mechanically from `names` (no
   separate `importMap` field — YAGNI). Installer: (a) copy each `scripts/__dropins__/<name>/**`
   subtree from `source@b2b`, dedup vs dest; (b) additively merge import-map keys into `head.html`
   (parse `<script type="importmap">`, add missing keys, re-serialize — precedent:
   `pdp404HandlerPublisher` already parses + commits `head.html`). Initializers + deps already done.
5. **Stale storefronts (MEDIUM-HIGH):** vendoring is additive + idempotent (dedup vs dest), so
   re-running setup repairs broken storefronts — BUT the EDS reset path (`edsResetRepoHelper`) does
   NOT currently re-run feature packs, so the fix must wire dropin vendoring into reset (or make reset
   re-run feature packs). No bespoke migration needed.

## Scoping (clarified by research)

Two distinct "b2b" paths: the standalone **`b2b` demo package** clones the complete
`adobe-commerce/boilerplate-b2b-template` (no feature pack — already works); the **broken case is the
additive `b2b-commerce` feature pack** layered onto a citisignal/non-b2b clone of
`hlxsites/aem-boilerplate-commerce@main`. This fix targets the additive case.

## Recommended design (for the focused completion / /rptc:feat)

Additive subtree vendoring, mirroring blocks:
1. `src/types/featurePacks.ts` — add `dropins?: { install; sourceDir?; names: string[] }`.
2. `feature-packs.json` — add the 6 b2b dropin `names` (company-management, company-switcher,
   purchase-order, quick-order, quote-management, requisition-list) to the `b2b-commerce` pack.
3. `featurePackInstaller.ts` — new `installFeaturePackDropins`: list+copy `scripts/__dropins__/<name>/**`
   subtrees from `pack.source` (dedup vs dest), and additively inject import-map keys into `head.html`;
   push into the existing atomic commit.
4. `edsResetRepoHelper.ts` — run feature-pack dropin vendoring on reset so stale storefronts self-heal.
5. Tests: subtree copy, import-map additive merge, idempotency/dedup, reset repair.

`package.json` `@dropins/*` deps are cosmetic at runtime (runtime uses the vendored files, not
`node_modules`) but kept for the Adobe-MCP update checker / dev typecheck; current `feature-packs.json`
names are all published.

## Constraints

- Generated `__dropins__` + `head.html` must be committed to the storefront GitHub repo (edge serves
  from GitHub, not the local clone).
- Use the published dep names from the current `feature-packs.json` (all 6 verified on npm 2026-06-12).
- Follow ADR-006 thin-layer discipline where it applies.

## Immediate stopgap (owner needs B2B today — separate from the research pass)

Manual recovery for the existing `citisignal-b2b` storefront, pending the real fix. Simplest is to
copy the already-built artifacts from `hlxsites/aem-boilerplate-commerce@b2b` (everything is pre-built
and committed there):
1. Copy the 6 b2b `scripts/__dropins__/<name>/` subtrees from `@b2b` into the storefront
   (company-management, company-switcher, purchase-order, quick-order, quote-management, requisition-list).
2. **Manually add the 6 import-map entries to `head.html`** — copy them from `@b2b/head.html`
   (`"@dropins/storefront-<name>/": "/scripts/__dropins__/storefront-<name>/"`). Research confirmed
   `npm install`/`postinstall` does NOT write the import map — it only copies `__dropins__` files — so
   this step is manual and load-bearing.
3. Copy the 6 b2b initializers from `@b2b/scripts/initializers/`.
4. Set the 6 b2b deps in `package.json` to the current published versions (from `feature-packs.json`).
5. Commit + push `scripts/__dropins__/`, `head.html`, `scripts/initializers/`, and `package.json` to the
   storefront GitHub repo; republish. Verify a b2b block (e.g. company switcher) loads at the edge.

(Equivalent path: run `npm install` locally to populate `__dropins__`, but you STILL must hand-add the
head.html import-map entries and commit/push everything — the build never writes the import map.)

## Kickoff prompt

> Research is complete (answers + design above). Run `/rptc:feat "Complete b2b feature-pack dropin
> delivery: additively vendor the 6 b2b `scripts/__dropins__/<name>/` subtrees from `source@b2b` and
> inject the matching head.html import-map entries in `featurePackInstaller.ts` (new `dropins` field on
> the FeaturePack schema), mirroring `installBlockCollections`; wire it into `edsResetRepoHelper` so
> stale storefronts self-heal. Per the design in
> `.rptc/backlog/2026-06-12-b2b-feature-pack-dropin-delivery.md`."
