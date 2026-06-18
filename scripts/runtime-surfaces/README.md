# Runtime-surface derivation — prototype

Feasibility prototype for **[ADR-008](../../docs/architecture/adr/008-derive-runtime-surface-inventory.md)**:
can the hand-maintained runtime-surface inventory
(`src/features/eds/services/runtimeSurfaceInventory.ts`) be regenerated from
Adobe's boilerplate instead of curated by hand?

This is **not extension runtime code** and is not wired into the build. It exists
to measure the idea. The production home (per ADR-006) is the daily last-known-good
gate in `skukla/eds-demo-patches`, which already clones canonical every day.

## What it does

Statically scans a cloned EDS storefront boilerplate for the content paths the
storefront **code** fetches at runtime — the orphan documents a demo needs but that
nothing in the published content links to, so reference-following discovery can
never reach them. For each derived surface it records provenance (`file:line`) and a
confidence note, then diffs the derived set against the current hand list.

Derivation classes (grounded in real boilerplate code):

| Class | Pattern | Example |
|---|---|---|
| Code-loaded fragments | `loadFragment('…')` | `/customer/sidebar-fragment` |
| nav / footer | `getMetadata('nav'\|'footer')` default | `/nav`, `/footer` (metadata-overridable) |
| Placeholder sheets | `'placeholders/<name>.json'` literal | `placeholders/checkout` |
| Customer/auth pages | `'/customer/<page>'` literal | `/customer/account`, `/customer/login` |

Known residual it **cannot** derive (by design — see ADR-008): Helix platform
conventions (`/metadata`, `/redirects`, `/sitemap`), content-only entry points, and
metadata-overridden real nav/footer paths.

## Run

```bash
# clone a boilerplate
git clone --depth 1 https://github.com/adobe-commerce/boilerplate-b2b-template /tmp/bp-b2b

# human-readable report + drift vs the hand list
node scripts/runtime-surfaces/deriveRuntimeSurfaces.mjs /tmp/bp-b2b

# machine-readable
node scripts/runtime-surfaces/deriveRuntimeSurfaces.mjs /tmp/bp-b2b --json
```

Exit code is always 0 — it reports, it does not gate.

## Test

```bash
node --test scripts/runtime-surfaces/deriveRuntimeSurfaces.test.mjs
```

Fixtures are trimmed-but-faithful snippets from the real B2B boilerplate.

## Latest evidence

`.rptc/research/runtime-surface-derivation/findings.md` — run against
`adobe-commerce/boilerplate-b2b-template` @ `160b453e`: **14 of 18** hand-declared
surfaces re-derived automatically, plus **9 surfaces the hand list misses**
(including a latent `/customer/nav`-class orphan fragment).
