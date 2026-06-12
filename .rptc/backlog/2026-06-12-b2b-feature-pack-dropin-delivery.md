# B2B feature pack — dropins never reach the browser (research → focused completion)

**Filed:** 2026-06-12 · **Status:** ready (research-first) · **Priority:** HIGH — owner needs working B2B today

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

## Research questions (the pass must answer before designing)

1. **Canonical delivery:** confirm `build.mjs`/`postinstall` is the intended/official Adobe mechanism
   for adding dropins (vs any `aio`/`aem` CLI or manual vendoring). Does `build.mjs` also edit the
   head.html import map, or only copy files? What else does `postinstall.js` do?
2. **Commit path:** the generated `__dropins__` + head.html are produced LOCALLY by `npm install`.
   What commits/pushes them to the storefront GitHub repo so Helix serves them? Does any current step
   do this, or is it the missing piece?
3. **Where should this run in the demo-builder pipeline** — during `installFeaturePacks` (Git Tree
   commit of generated files), or as a post-`npm install` local-build-then-push step in the EDS
   storefront setup? Reconcile with the MCP isolated-install change (storefront `npm install` may
   still fail for other reasons — does dropin delivery need its own resilient install of just the
   `@dropins/*` deps + build, like the MCP fix does for MCP tools?).
4. **Schema/installer changes:** does `FeaturePack` need a `dropins`/`importMap` field, or is
   "deps + build + commit" enough generically?
5. **Stale storefronts:** how do existing b2b storefronts (wrong dep names, partial initializers,
   no `__dropins__`) get repaired — reset/recreate, or a migration?

## Constraints

- Generated `__dropins__` + `head.html` must be committed to the storefront GitHub repo (edge serves
  from GitHub, not the local clone).
- Use the published dep names from the current `feature-packs.json` (all 6 verified on npm 2026-06-12).
- Follow ADR-006 thin-layer discipline where it applies.

## Immediate stopgap (owner needs B2B today — separate from the research pass)

Manual recovery for the existing `citisignal-b2b` storefront, pending the real fix:
1. In the storefront `package.json`, replace the stale b2b deps with the current published set from
   `feature-packs.json` (company-management ~1.2.0, company-switcher ~1.1.1, purchase-order ~1.1.1,
   quick-order ~1.0.1, quote-management ~1.1.2, requisition-list ~1.3.0).
2. `npm install` in the storefront (postinstall runs `build.mjs` → vendors b2b `__dropins__` + import map).
3. Copy the 6 b2b initializers from `hlxsites/aem-boilerplate-commerce@b2b` `scripts/initializers/`.
4. Commit + push the generated `scripts/__dropins__/`, `head.html`, and initializers to the storefront
   repo; republish. Verify a b2b block (e.g. company switcher) loads at the edge.

## Kickoff prompt

> Run `/rptc:research` on "EDS dropin delivery mechanism + how the b2b feature pack should vendor and
> commit dropins (`scripts/__dropins__/` + head.html import map) so they load at the edge." Answer the
> 5 research questions in `.rptc/backlog/2026-06-12-b2b-feature-pack-dropin-delivery.md`, then design a
> focused completion of `featurePackInstaller.ts` (+ `FeaturePack` schema if needed). Coordinate with
> the shipped MCP isolated-install change.
