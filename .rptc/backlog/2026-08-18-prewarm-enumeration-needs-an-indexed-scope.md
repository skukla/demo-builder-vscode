# Catalog prewarm fails on a store view with no Catalog Service index

**Filed:** 2026-08-18, from a colleague's storefront creation on the shared
sandbox. Distinct from `pdp-prewarm-401-after-admin-pinning` (that one is the
prewarm POST being refused; this one is the ENUMERATION that precedes it).

## Symptom

```
[Catalog Prewarm] Catalog enumeration failed: GraphQL errors:
No index was found for this request — falling back to runtime smart-404 only
```

Prewarm never runs. No `Enumerated N SKUs` line, so the `0/N succeeded` symptom
of the 401 item never appears — the two are easy to confuse and were confused
once already during triage.

## What it actually means

`enumerateAccsCatalog` queries `productSearch(phrase: "", …)`
(`catalogPrewarmService.ts:98`) — the Catalog Service surface — scoped by the
`Store: <storeViewCode>` header that `generateHeaders` builds.

`No index was found for this request` is that service reporting **this store
view has no search index**. The index is built per scope and separately from the
catalog itself, so three states are independent:

| State | Reported by |
|---|---|
| Products exist in Commerce Admin | the Admin |
| Catalog synced to Catalog Service for the scope | — |
| **Search index built for the scope** | `productSearch` — this is what fails |

**Confirmed against a live case:** the reporter's backend HELD products and
enumeration still failed. So an empty catalog is NOT the explanation, and any
fix that assumes "no products yet" is aimed at the wrong thing.

## Why the same run worked for someone else

Same Commerce endpoint (`na1-sandbox`), different scope: 3 websites / 3 store
groups / 3 store views for the working run, 2 / 2 / 2 for the failing one. The
working scope was indexed; the failing one was not.

## Partly addressed 2026-08-18

The message now names the scope it queried (`describeScope`, websiteCode /
storeCode / storeViewCode), so a project with more than one store view can tell
WHICH one is unindexed. That was previously unanswerable from the log.

## What remains — a decision, not a hunt

1. **Is an unindexed scope a user error or a supported state?** If demo scopes
   are expected to be freshly created, prewarm will meet this routinely and the
   warning should say what to do (enable/run indexing for that store view)
   rather than only what failed.
2. **Should enumeration fall back to `products(skus:)`?** That path needs no
   search index. It cannot enumerate blind — it takes SKUs — so it only helps if
   a SKU list is available from elsewhere. Probably not worth it; record the
   decision either way.
3. **Ordering, independent of indexing.** Prewarm runs in `edsPipeline.ts:770`;
   the sample-data import runs later, in `executor.ts:630`. On a FIRST create,
   prewarm therefore runs before any datapack is imported, and only sees a
   populated catalog on a subsequent reset. Verify whether that is deliberate —
   both observed runs are consistent with it.

**Unverified:** whether Catalog Service sync and search indexing are separately
switchable per store view on ACCS, which decides whether (1) is one setting or
two. Check before writing guidance.
