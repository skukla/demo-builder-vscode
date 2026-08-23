# Catalog prewarm fails on a store view with no Catalog Service index

> ## CLOSED 2026-08-23 — all three decisions made; guidance shipped
>
> **Decision 3 (ordering) was already answered in code — the premise went
> stale.** Creation imports the datapack (phase 5c) BEFORE prewarming (5d,
> `executor.ts`, with a comment explaining the reset/create asymmetry), and
> the creation-time pipeline deliberately passes NO project to step 8
> (`storefrontSetupPhases` — `projectTargetsStorefront` yields undefined on
> create, guarding against prewarming a DIFFERENT project's catalog). The
> ordering this item asked to verify shipped between filing and pickup.
>
> **Decision 1: an unindexed scope is a SUPPORTED state with a DOCUMENTED,
> non-self-serve remedy** — not a user error, and NOT (as a first draft of
> this closure said) "usually transient". A retried internal search settled
> the mechanism, corroborated by Live Search's public **"Catalog data
> retention policy"** (Live Search overview): an environment whose catalog
> stays EMPTY for 45 days — or a testing environment unqueried for 90 — is
> HIBERNATED, and (per the search team, paraphrased) syncing products does
> NOT by itself recreate the index; each store view has its own. That is
> exactly the demo-instance story: sit empty → hibernate → import a pack →
> "No index was found", indefinitely. A field-reported first try (unverified,
> ACCS case 2026-08-23): edit any product attribute — a metadata update can
> force index creation. The documented remedy is an Adobe support request
> titled "Reactivate Live Search" with the environment id (restored within a
> couple of hours). Both clauses of the policy were verified to apply to ACCS
> (2026-08-23): the 45-day empty-catalog clause hits production AND testing
> environments; the 90-day unqueried clause hits testing only. The warn now carries all of that, plus what still works
> (runtime smart-404 publishes each PDP on first visit — prewarm is an
> optimization) and the retry. Republish did NOT prewarm when this
> closed; decided AND implemented the same day: `republishStorefrontContent`
> (the spine both the dashboard button and MCP `sync_content` ride) now
> prewarms after its content publish — the lightweight retry once a
> hibernated index is reactivated, and it refreshes previously-prewarmed
> PDPs, which the content publish never reaches. Reset remains the
> heavyweight path.
> Branch-discriminated from generic enumeration failures, both pinned by
> test.
>
> **Decision 2: no `products(skus:)` fallback.** It needs a SKU list, only
> helps in the narrow synced-but-unindexed state, that state is brief once
> the ordering is right, and the runtime smart-404 already covers every SKU.
> Complexity for a vanishing window.
>
> Related: the tabled instance-hygiene design treats this same probe as its
> "waiting-external" readiness state — this closure's framing feeds it.

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
