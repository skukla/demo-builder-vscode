---
id: 2026-06-09-dropin-version-coupling
title: Drop-in version coupling check — citisignal drifted, buildright unexpectedly empty
status: backlog
created: 2026-06-09
priority: medium
related: 2026-06-09-evaluate-thin-layer-storefront-model
---

# Drop-in version coupling — citisignal drifted, buildright unexpectedly empty

## Provenance

Surfaced 2026-06-09 during the small-items sweep after the My Account left-nav fix shipped. Filed alongside the storefront-template-sync and thin-layer-evaluation backlog items as part of the broader fork-drift audit.

## Finding 1: citisignal-eds-boilerplate @dropins drifted from canonical

Measured 2026-06-09. Canonical reference: `hlxsites/aem-boilerplate-commerce` `package.json` on `main`.

| Package | citisignal | canonical | Gap |
|---|---|---|---|
| `@dropins/build-tools` | 1.0.1 | 1.1.0 | minor |
| `@dropins/storefront-account` | ~3.0.0 | ~3.3.0 | 3 minors |
| `@dropins/storefront-auth` | ~3.0.0 | ~3.2.0 | 2 minors |
| `@dropins/storefront-cart` | ~3.0.0 | ~3.2.0 | 2 minors |
| `@dropins/storefront-checkout` | ~3.0.1 | ~3.2.1 | 2 minors |
| `@dropins/storefront-order` | ~3.0.0 | ~3.3.0 | 3 minors |
| `@dropins/storefront-payment-services` | ~3.0.0 | ~3.1.0 | 1 minor |
| `@dropins/storefront-pdp` | ~3.0.0 | ~3.0.3 | 3 patches |
| `@dropins/storefront-personalization` | ~3.0.0 | ~3.1.1 | 1 minor |
| `@dropins/storefront-product-discovery` | ~3.0.0 | ~3.1.0 | 1 minor |
| **`@dropins/storefront-recommendations`** | **~3.0.0** | **~4.0.1** | **major** |
| `@dropins/storefront-wishlist` | ~3.0.0 | ~3.2.0 | 2 minors |
| `@dropins/tools` | ~1.6.0 | ~1.8.1 | 2 minors |

**Risk**: when canonical Boilerplate Commerce starts depending on features introduced in any of these newer versions — especially `storefront-recommendations` 4.x's likely breaking changes — the citisignal storefront will fail at runtime in ways that don't show up at install time. Silent rot.

Drop-in version bumps in canonical's `package.json` are also among the 185 "behind" commits the sync project documents. If we sync, these come along. If we drop the forks (per the thin-layer evaluation), they resolve automatically.

## Finding 2: buildright-eds has no @dropins in package.json

Measured 2026-06-09.

```
buildright-eds/package.json
  name: buildright-website
  total deps: 2
  first 5 deps: [('glob', '^10.4.5')]
```

Two deps total. No `@dropins/*` entries. But buildright is a Commerce storefront (`requiresMesh: true`, `adobe-commerce-aco: required` per `demo-packages.json`). Commerce drop-ins are presumably needed for PDP, cart, checkout, etc. to work.

**Possible explanations** (none verified):

- Drop-ins are loaded at runtime via CDN script tags rather than bundled via npm.
- Demo Builder installs them as part of feature pack / block library setup at create time.
- Buildright is built against an older Commerce model that didn't use npm-distributed drop-ins.
- Something is broken or partial in the current buildright setup.

This is a real "I don't understand the architecture here" finding that the thin-layer evaluation will need to clarify. If buildright works without @dropins in package.json, it's a strong signal that drop-in coupling isn't load-bearing for it — which simplifies the migration story significantly.

## Recommendation

**Treat both findings as input to `2026-06-09-evaluate-thin-layer-storefront-model.md`.** No standalone action here:

- If the thin-layer evaluation recommends retiring the forks, drop-in versions become canonical's concern. Both findings resolve.
- If it recommends keeping the forks, the version bumps land as part of the sync project. Finding 2 still needs an architecture clarification regardless.
- If it recommends the hybrid (thin layer + code patches), versions still need a decision but the surface is smaller.

Don't bump versions in the forks unilaterally before the thin-layer decision — could introduce drift in the wrong direction and waste effort.

## Method (for the curious)

Measured per repo:

```bash
gh api repos/<owner>/<repo>/contents/package.json --jq '.content' | base64 -d
```

Filter `dependencies` + `devDependencies` for `@dropins/*` and compare line-by-line against canonical.
