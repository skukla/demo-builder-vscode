# ADR-009: Storefront config.json Flag Injection — the Generator Owns Config, So Template Flags Must Be Re-Injected

**Status**: Accepted
**Date**: 2026-06-19
**Decision Maker**: Project Owner
**Implementer**: 2026-06-19 (this slice)

Related: [ADR-006 Thin-Layer Storefront Customization](006-thin-layer-storefront-customization.md), [ADR-008 Derive Runtime-Surface Inventory](008-derive-runtime-surface-inventory.md). Both concern the same create/reset regeneration model.

---

## Context

### The problem

B2B storefronts rendered an **empty "My Account" navigation** (company management,
quotes, purchase orders, requisition lists). The page loaded fine — the nav was
just blank — which masked the cause.

The `commerce-account-nav` block does not build its links directly. It builds them
only inside an `auth/permissions` event callback, and that event only fires when
the storefront reads `commerce-b2b-enabled === true` from its config
(`scripts/initializers/auth.js` → `getConfigValue('commerce-b2b-enabled')`). With
the flag absent the event never fires, the block never builds links, and the nav
is silently empty.

### Why the flag was absent — the load-bearing invariant

The `boilerplate-b2b-template` repo *does* ship `commerce-b2b-enabled` in its
`config.json`. But the extension never uses the template's `config.json` — it
**regenerates `config.json` wholesale** from its own bundled `config-template.json`
on **every create and every reset** (`configGenerator` is the single source of
truth; see ADR-006's thin-layer model). The regenerated file contains only what
the generator knows to write, so anything the template provided but the generator
doesn't re-express is **dropped**. `commerce-b2b-enabled` fell into exactly that gap.

This is the non-obvious, regression-prone invariant this ADR exists to record:

> **The generator owns `config.json`. Anything a storefront template provides in
> its config that the storefront's runtime depends on must be re-expressed as a
> generator input — or it silently disappears on the next create/reset.**

A future contributor who relies on a template-shipped config value will reintroduce
a silent-failure bug of this exact shape.

## Decision

Make the generator inject the required flags, **data-driven per demo package**.

- A demo package declares a `configFlags` object in
  `src/features/project-creation/config/demo-packages.json`. The unbranded `custom`
  hybrid (displayed "Custom (B2B + B2C)") and the branded `citisignal` hybrid both
  declare `commerce-b2b-enabled: true` and `commerce-companies-enabled: true`.
- `configGenerator` merges those into `config.public.default` via a single
  `injectConfigFlags` primitive — the **same** primitive used for addon-level
  `configFlags` (one injector, two sources: addons and packages).
- All three config-writing paths — create, EDS reset, and storefront republish —
  flow through the generator (`buildConfigGeneratorParams` / `extractConfigParams`),
  so the flags land consistently regardless of how the storefront is provisioned.

Why this shape:

- **Data-driven** — JSON declares the flags; no per-package branching in code.
- **Reuses the existing mechanism** — addon `configFlags` already worked this way;
  packages now share the one `injectConfigFlags` helper.
- **Right destination** — `config.public.default` is exactly where the storefront's
  `getConfigValue` reads.
- **Right granularity** — package-level, because B2B-ness is intrinsic to the
  package (every storefront variant of a B2B package uses `boilerplate-b2b-template`),
  not a per-storefront variation or a per-project user toggle.

## Alternatives considered (ruled out)

1. **Ship the flag in the template repo's `config.json`** — ruled out: the generator
   clobbers it on every create/reset. The template's config is not authoritative for
   a provisioned storefront; only the generator's inputs are.
2. **A B2B-specific `config-template.json`** — ruled out: duplicates the entire
   template to set two keys. Not DRY.
3. **A `{B2B_ENABLED}` placeholder, like `{AEM_ASSETS_ENABLED}`** — ruled out: the
   value is constant per package, so a package-declared flag is simpler than template
   markup plus parameter plumbing.
4. **Model B2B as an addon** (reuse addon `configFlags` directly) — ruled out: B2B
   has no backing service and no env vars, and addons surface in the wizard as
   "Optional Services" checkboxes; a required-but-disabled "B2B" checkbox is
   confusing. B2B is a package identity, not a pluggable component.

## Evidence (gathered 2026-06-19)

- **The gate**: `blocks/commerce-account-nav/commerce-account-nav.js` builds links
  only inside `events.on('auth/permissions', …)`; `scripts/initializers/auth.js`
  emits that event only when `getConfigValue('commerce-b2b-enabled') === true`.
- **Validated** on `skukla/b2b-tester` (eds-accs) via a clean reset: the generated
  log line `Injected config flags from package: …`, the served
  `config.json` carried both flags `true`, and the B2B "My Account" nav rendered
  (visual confirmation). End-to-end.

## Consequences

### The invariant is now the rule, not a one-off

Any future storefront-runtime config that a template provides must be added to the
generator (as a template literal, a `{PLACEHOLDER}` param, or package/addon
`configFlags`) or it will not survive create/reset. This ADR is the standing warning.

### The nav needs two things, not one

The flag enables the *machinery*; the nav also needs its *content*. The account
menu is the `/customer/nav` fragment, referenced by bare text on the account page,
and the content-copy step on create/reset now **follows content references** so the
fragment is copied rather than silently dropped. Flag + content together make the
nav appear; either one missing yields an empty nav.

### Per-customer behavior

`commerce-b2b-enabled: true` enables the B2B machinery for the storefront; the
actual per-shopper view is role-gated at runtime via `auth/permissions`. So on the
hybrid packages, B2B (company) customers get the company nav while B2C shoppers get
the standard experience — one storefront, by customer type.

### Adding B2B to a new package

Add a `configFlags` block to that package in `demo-packages.json`. No code change —
`injectConfigFlags` is data-driven.

### Accepted limitation

`configFlags` keys are unvalidated strings (shared with the addon mechanism); a typo
(`commerce-b2b-enabld`) silently injects a dead key. Acceptable for now; a schema
tying keys to known storefront config keys is a possible future hardening.
