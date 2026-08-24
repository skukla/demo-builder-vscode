---
name: eds-dropin-vendoring
description: How EDS storefront dropins (@dropins/storefront-*) actually reach the browser — import map + committed __dropins__ vendoring — and how to add dropin-backed features without silently shipping ones that never load. Use when a dropin doesn't load at runtime, a block renders empty (e.g. empty B2B "My Account" nav), you're adding a @dropins dependency to a storefront, editing head.html's import map, or choosing between overlaying dropins vs switching base template.
---

# EDS Dropin Delivery and Vendoring

## When NOT to use

Publish/unpublish auth, Helix/DA.live config scoping, or CDN path-encoding problems → use the sibling skill `eds-publish-and-config`.

## Procedure / Rules

1. **Runtime delivery = import map → committed vendored files, never npm.** `head.html` has an `importmap` mapping `@dropins/storefront-X/` → `/scripts/__dropins__/storefront-X/`; the browser loads the committed `scripts/__dropins__/` files served at the edge by Helix. `node_modules` is never used at runtime, so `@dropins/*` in `package.json` is effectively dev-only.
2. **The import map is HAND-maintained — no build step ever writes it.** The storefront's `postinstall` (`install:dropins` = `node build.mjs && node postinstall.js`) splits as: `build.mjs` does GraphQL fragment patching ONLY; `postinstall.js` copies `node_modules/@dropins/X` → `scripts/__dropins__/X/` for deps listed in `dependencies`. Neither touches `head.html`.
3. **Generated files must be COMMITTED to the storefront's GitHub repo** — the edge serves from GitHub, not from any local clone. The extension writes to storefront repos via the Git Tree API (`src/features/eds/services/github/githubFileOperations.ts`); a local `npm install`'s postinstall output is never pushed automatically.
4. **Dropins are a BASE-TEMPLATE concern, not an overlay.** `@dropins/*` ship as one coordinated release set sharing internal chunks (e.g. `tools/chunks/preact-vendor.js`); overlaying current-line dropins onto an older base produces a missing-chunk blank page. This killed the additive "feature pack" mechanism (removed outright; resolution record: `.rptc/complete/2026-06-12-b2b-feature-pack-dropin-delivery.md`). To get B2B dropins, select a package built on `boilerplate-b2b-template` (see `src/features/components/config/demo-packages.json`) — do not bolt b2b dropins onto a non-b2b clone.
5. **To add a single dropin to an existing storefront** (all five steps, in order — skipping any one ships a dropin that silently never loads):
   1. Add the *published* `@dropins/storefront-<name>` dep to `package.json` (verify it exists on npm; renamed/unpublished names 404 and abort install, so postinstall never runs).
   2. `npm install` — postinstall vendors it into `scripts/__dropins__/<name>/`.
   3. **Hand-add the import-map entry** to `head.html`: `"@dropins/storefront-<name>/": "/scripts/__dropins__/storefront-<name>/"`.
   4. Add the initializer in `scripts/initializers/`.
   5. Commit `scripts/__dropins__/<name>/`, `head.html`, the initializer, and `package.json` to the storefront GitHub repo, then republish. Committing generated output is intentional here — pause and confirm with the user before pushing to their storefront repo.
6. **Dropin-backed features may also need generated `config.json` flags, injected data-driven** (ADR: `docs/architecture/adr/009-storefront-config-flag-injection.md`). The extension regenerates `config.json` wholesale on every create/reset, so a flag shipped in the template is clobbered — flags must come from the generator's inputs: `configFlags` on the package in `demo-packages.json` → `injectConfigFlags` in `src/features/eds/services/configGenerator.ts` merges them into `config.public.default`.

## Gotchas

- **B2B "My Account" nav renders EMPTY without `commerce-b2b-enabled: true`** (plus `commerce-companies-enabled`) in served `config.json` — `commerce-account-nav` builds links only inside an `auth/permissions` event that fires only when that flag is true (storefront `scripts/initializers/auth.js`). Silent failure; both hybrid packages declare the flags via `configFlags` in `demo-packages.json`.
- **A storefront can have deps + blocks + initializers and still load zero dropins** — the historical b2b feature pack merged `package.json` deps and copied blocks but never vendored `__dropins__` or added import-map entries: 0/6 dropins at runtime. Presence of the dep proves nothing; check the vendored files and the map.
- **Package id history**: the unbranded hybrid package id is `custom` (renamed from `b2b`); persisted old ids are normalized permanently by `normalizePackageId` in `src/core/state/projectFileLoader.ts`. Don't reintroduce a `b2b` package id.
- **Mixed dropin versions fail as a blank page, not an error banner** — a missing shared chunk (`preact-vendor.js` and friends) aborts module resolution. If a page goes blank after touching dropins, suspect version/base mismatch first.

## Verify

Never assert from the diff — probe the deployed edge and the browser:

1. **Import map resolves**: `curl -s https://main--{repo}--{owner}.aem.live/head.html` (or view page source) → the `importmap` contains an entry for every dropin you expect.
2. **Vendored files served**: `curl -sI https://main--{repo}--{owner}.aem.live/scripts/__dropins__/storefront-<name>/api.js` → 200 (a bare 13-byte 404 means the files were never committed/published).
3. **Runtime load**: open the page with the browser network tab — the dropin's JS and shared chunks (`preact-vendor.js`) all return 200, console shows no failed module resolutions, and the feature's block actually renders content.
4. **Config flags**: `curl -s https://main--{repo}--{owner}.aem.live/config.json` → expected flags present under `public.default`; then visually confirm the gated UI (e.g. the B2B account nav has links).

_If this skill was wrong or incomplete, fix it before closing the task._
