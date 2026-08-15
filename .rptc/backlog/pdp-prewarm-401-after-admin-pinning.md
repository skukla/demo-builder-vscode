# Catalog prewarm 401s on every new storefront, because we pin an admin first

**Filed:** 2026-08-15, reported by the `feature/bodea-template` session and
routed here for develop. Not Bodea-specific.
**Severity:** prewarm failure is certain and total. A second, larger consequence
is plausible and **unproven** — see "The part nobody has proven" below. Verify
that first; it decides whether this is a slow-PDP annoyance or a broken feature.

## Symptom

Fresh storefront creation, ACCS backend, seeded catalog:

```
[Catalog Prewarm] Enumerated 39 SKUs; pre-warming PDP URLs in batches of 5
[Catalog Prewarm] Complete: 0/39 succeeded, 39 failed
```

100% — systemic, not per-SKU.

## The chain, verified

**1. The prewarm POST carries no credentials.** `prewarmOne`
(`src/features/eds/services/catalogPrewarmService.ts:341-358`) builds a URL with
`org` / `site` / `path` query parameters and calls `fetch` with a method and a
timeout signal — **no `headers` key at all**. Read directly, 2026-08-15.

**2. The action gets a 401 from Helix.** The reporting session called it with the
same shape `prewarmOne` builds:

```
POST .../api/v1/web/accs-discovery/prepublish-pdp?org=…&site=…&path=%2Fproducts%2F…
→ 502  {"error":"Preview failed (401)","success":false}
```

**3. We close that door ourselves, two minutes earlier in the same run.**

```
[ConfigAccess] Granted admin on <org>/<site> to 1 user(s)
[ConfigAccess] Pinned <masked> as an admin on <org>/<site>
```

The rule is already written down in `.claude/skills/eds-publish-and-config`: a
site with ANY `access.admin` role closes the WHOLE admin API, and from then on
preview, publish, bulk and cache-purge all require the DA.live IMS bearer. The
skill even notes that storefront setup now pins an admin at registration, so this
is the normal state rather than an edge case.

So: **admin pinned at registration → `requireAuth: auto` → the anonymous
`prepublish-pdp` action can no longer preview.** The rule was known. What it
missed is that an *external* action publishes on the storefront's behalf too, and
that action was never given a way to authenticate.

## The part nobody has proven

Per ADR-005, the runtime smart-404 fallback POSTs to the **same** action —
confirmed in `pdp404HandlerPublisher.ts:141`, which derives its trigger URL via
`derivePrepublishUrl(overlayUrl)`. If prewarm 401s, that fallback plausibly 401s
too, in which case a PDP that was never pre-published cannot self-heal and BYOM
PDP routing is broken end to end on new storefronts rather than merely cold.

**This has not been tested** — the reporting session's catalog had no indexed PDP
content. It is a hypothesis with a clear falsifier: publish one PDP path through
the overlay's smart-404 route on a site with a pinned admin and see whether it
returns 2xx. Do that before scoping any fix, because it decides the severity.

Note the prewarm summary tells the user "failed paths fall back to smart-404 at
runtime". If the hypothesis holds, that reassurance is now false, which is worse
than the failure itself.

## Scope

Every package carrying `byomOverlayUrl` — `custom`, `citisignal`, Bodea — on any
storefront created since admin pinning landed.

## Pointers

- `catalogPrewarmService.ts:341-358` (`prewarmOne`, unauthenticated POST), `:203`
  (batch runner), `:62` (`BATCH_SIZE`)
- `derivePrepublishUrl` in `pdp404HandlerPublisher.ts`
- The action itself lives in the separate `accs-discovery-service` repo

## Directions, none chosen

1. Authenticate the action — it holds its own credentials and presents the
   DA.live bearer.
2. Thread a token from the extension to the action per call. Note the measured Helix finding
   behind ADR-002 and `helixService.getDeleteAuthHeaders()`: only the DA.live IMS
   bearer clears this class of guard; a GitHub token and an API key both 403.
3. Revisit whether pinning an admin at registration should be the default, given
   it closes the anonymous publish path. This is the cheapest to say and the most
   disruptive to do — the pinning exists for the 403-repair story.

Options 1 and 2 both land partly or wholly in another repo, which is why this is
filed rather than fixed.
