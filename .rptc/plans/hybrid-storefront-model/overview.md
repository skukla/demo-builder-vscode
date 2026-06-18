# Plan — Hybrid storefront (Tier 2) + B2B-ready prerequisite & detection

**Created:** 2026-06-18 · **Research:** `.rptc/research/hybrid-storefront-model/research.md`.
**Scope (PM):** canonical-boilerplate packages only (`b2b`, `citisignal-b2b`, `citisignal` EDS);
custom-base storefronts out. Backend B2B is a **user prerequisite** (no enable-API).

## Relationship to Tier 1

Tier 1 = `.rptc/plans/content-copy-completeness/` (the `/customer/nav` fix + discovery + audit) —
the foundation that makes the B2B account experience actually appear. This plan is **Tier 2**:
(a) help the user get a **B2B-ready backend** (prerequisite doc + reliable read-only detection), and
(b) **rebase the EDS `citisignal` package** onto the B2B base so it becomes hybrid (gated on live
verification).

## Steps

| Step | Title | Buildable now? |
|---|---|---|
| 01 | B2B-ready prerequisite doc + read-only `storeConfig` detection | ✅ Yes |
| 02 | Rebase EDS `citisignal` onto the B2B base (branded overlay) → hybrid | ⛔ Gated on live login-UX verification (research checks 1–3) |

## Why incremental

The platform already supports the hybrid model (permission-gated nav; ACCS serves B2B+B2C from one
instance). The risk is all in the edges — does an individual customer cleanly *not* see B2B items
(esp. the `all`-tagged ones), and does the b2b base degrade to B2C without regressions. Step 01 is
safe and useful immediately; Step 02 waits on a live check that can't run in this env.

## Definition of done

- Hybrid packages surface a clear B2B-ready prerequisite; detection warns (true-negative-only) when
  the connected backend has B2B off. `citisignal` EDS rebased + verified hybrid. `npm test` green.
