# Addendum: Runtime validation against develop (2026-06-09)

**Captured**: 2026-06-09 (after `e07daca9` landed on develop)
**Tester**: live curl probes against `skukla/citisignal-b2b` — a storefront created earlier the same day on current `develop` with the overlay registered (`byom.enabled` default true, default overlay URL).
**Purpose**: validate three claims from the original research before any Phase 1 implementation: (a) the overlay-at-runtime model in §0, (b) the open §3.1 item on server-side `/config.json` fetchability, (c) whether case-sensitivity (not addressed in the original) is a real gap.

This addendum **does not overturn the owner-locked decisions** (two-phase ship, shared not per-project, stage workspace OK). It refines what "Phase 1 = finish + ship" actually requires to deliver on its goal of killing PDP 404s.

---

## Finding 1: The overlay is NOT consulted at runtime — only at admin preview/publish

**Original claim (§0)**: "the current generic-template version (no real product data) already: **Fixes the 404** — every `/products/{urlKey}/{sku}` returns 200 (path-shaped, no per-SKU authoring)."

**Counter-evidence**: cold PDP paths return 404 on `aem.live`, even with the overlay registered and the action returning 200 when called directly.

```
GET https://main--citisignal-b2b--skukla.aem.live/products/orchard-2/orchard2
→ HTTP 404 (cold)

POST https://admin.hlx.page/preview/skukla/citisignal-b2b/main/products/orchard-2/orchard2
→ HTTP 200 (overlay called, content returned, stored in bus)

POST https://admin.hlx.page/live/skukla/citisignal-b2b/main/products/orchard-2/orchard2
→ HTTP 200 (preview promoted to live)

GET https://main--citisignal-b2b--skukla.aem.live/products/orchard-2/orchard2
→ HTTP 200 (now serves)
```

**Mechanism**: Helix's live-serve path reads from content-bus. The overlay is consulted only during admin preview/publish operations — those operations dispatch to the overlay, store the response in content-bus, and live serves from there. The overlay being registered does nothing on its own for runtime traffic; *something* has to trigger admin preview+publish for each URL.

**Where the original research went wrong**: §0's "Helix dispatches every page request to the overlay URL before falling back to authored content" reads as a runtime statement. The Adobe Developers Live talk language it's based on ("when a preview request comes in") refers to admin preview operations, not live runtime hits. The runtime overlay-dispatch model would make the Adobe pre-render team's whole architecture (cron pollers → render → store → overlay points at static files) redundant; that they built that pipeline at all confirms the overlay is not a runtime dispatcher.

**Implication for Phase 1**: registering the overlay (already shipped on develop) is *necessary* but *not sufficient*. The action returning a valid response on call (confirmed working: `https://.../render-pdp/products/foo/bar?...` returns 200 with the generic template) is necessary but not sufficient. The missing piece is a **trigger that calls admin preview+publish per PDP URL**.

This is *not* the Adobe pre-generation model the research rules out in §2. It's narrower: use Helix's admin API at the right moment to seed content-bus with the overlay's response. No new storage tier, no cron poller, no per-tenant state file, no stored output to invalidate on reset. Just one more admin call per SKU.

---

## Finding 2: Case sensitivity — universal for the catalog, breaks PLP→PDP transitions

**Not addressed in the original research.** Affects every PDP click in the current demo data.

**Evidence**:

```
# Catalog SKUs (productSearch on the live Catalog Service endpoint):
sku='DigiWristExplorer'   url_key='pulsewear-max-3'
sku='DigiWristHarmony'    url_key='pulsewear-max-4'
sku='DroidView1'          url_key='droidview-1'
sku='Orchard1-1'          url_key='orchard-1'
sku='Orchard2'            url_key='orchard-2'
sku='ExternalBatteryPackforAllSmartPhones' …
# Every SKU returned is mixed-case. None are lowercase.

# Helix's preview API normalizes the path to lowercase before storing:
POST /preview/.../main/products/orchard-2/Orchard2
→ response.resourcePath = "/products/orchard-2/orchard2.md"  (lowercased)

# Live URL access is case-sensitive against the stored path:
GET .../products/orchard-2/orchard2 → 200 (matches stored path)
GET .../products/orchard-2/Orchard2 → 404 (case mismatch)
```

The storefront's PLP renders product links using `sku` verbatim from Commerce. So every PLP→PDP click produces a mixed-case URL that doesn't match Helix's lowercase-normalized storage. Even after pre-publishing (Finding 1's missing piece), the user clicks a product card on `/phones` and 404s on the resulting `/products/{urlKey}/Orchard2`.

**Scope**: probably affects most catalogs that didn't go out of their way to lowercase SKUs. The CitiSignal data isn't an outlier — `Orchard2`/`DroidView1`-style PascalCase is normal for Commerce demo catalogs (and real merchants vary). Real prospect catalogs *can* be lowercase, but we shouldn't bet Phase 1 on that.

**Implication for Phase 1**: a second gap to close, independent of Finding 1. Either:

- The storefront's PLP/link-generator lowercases the SKU before producing the `href`. Lives in the storefront repo (or as an extension-side patch at create time per §5 of the original research).
- Or pre-publish both cased and lowercased variants of each path (doubles the publish work, doesn't help SKUs we didn't pre-publish).

The link-generator fix is the universal answer. Lowercasing demo sample data is a complementary polish (smaller surface, narrower benefit).

---

## Finding 3: Live `/config.json` IS server-side fetchable — §3.1's residual unknown resolved

**§3.1 flagged**: "An anonymous fetch of `.../config.json` returned **HTTP 403** in testing while `/phones` works in a browser — so config.json is browser-reachable (the drop-in reads it) but may bot-block non-browser user-agents."

**Test**: same URL with a browser-like User-Agent.

```
curl -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 …" \
  https://main--citisignal-b2b--skukla.aem.live/config.json
→ HTTP 200 + full JSON
```

The blocker was UA, not architectural. App Builder runtime's `fetch` can set the same UA. The published config is reachable; the Phase 2 Design (A) dependency holds.

**Also confirmed in the same probe**: the live `config.json` matches the discrepancy §3.2 predicted — `commerce-endpoint = na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/graphql` (ACO-native), not the repo's `edge-sandbox-graph.adobe.io/…` (older Catalog Service family). The headers required by Catalog Service queries (`Store`, `Magento-Store-Code`, etc.) are present and non-secret. A direct GraphQL `productSearch` against that endpoint, with those headers, returns the product list (used as the data source for Finding 2's SKU casing evidence). All three sub-items in §3.1's "Residual open items" are now resolved.

---

## What this changes for Phase 1 — and what it doesn't

### Doesn't change

- The two-phase plan stands. Phase 1 is still functional-relief (no real product data); Phase 2 is still optional Design (A) on-demand rendering.
- Stay shared, not per-project. Both Phase 1 gaps below are addressable without per-tenant control planes or stored output.
- Stateless action requirement holds.
- Stage workspace acceptable.

### Does change

Phase 1's *concrete scope* — what "finish + release" actually entails — is two pieces wider than §0 describes:

1. **Pre-publish trigger** (lives in the extension): after the bulk publish of authored pages, the pipeline queries Catalog Service for the storefront's product list (urlKey, sku) and calls Helix admin preview+publish for each `/products/{urlKey}/{sku.toLowerCase()}` path. Bounded by a configurable cap (recommendation: 50 products for v1). Failure of a single SKU is logged but doesn't fail the pipeline. Reset re-runs the same step — fresh content-bus state every reset, no stored artifacts to invalidate. This satisfies §4 ("reset/edit are non-events") because nothing persists outside Helix's own bus.

2. **Link-case normalization** (lives in the storefront templates): wherever the PLP / search / cart renders a PDP link, lowercase the SKU at link-generation time. Per the template-ownership analysis (already on develop): direct commits to `skukla/citisignal-eds-boilerplate` and `skukla/buildright-eds`; patches at create-time in the extension for `adobe-commerce/boilerplate-b2b-template` and `hlxsites/aem-boilerplate-commerce`; a coordination note for `stephen-garner-adobe/isle5`.

### What this is *not*

- **Not Adobe's pre-generation model.** No per-tenant rendered HTML in storage. No cron pollers. No per-product state file. Helix's own content-bus holds the previewed responses, exactly as it does for any other previewed path. Reset re-publishes; nothing else owns lifecycle.
- **Not a control plane.** The catalog query uses the storefront's *public* config (Finding 3); no per-tenant secrets, no registry.
- **Not coupling to Demo Builder for state.** The action remains stateless. The extension's pipeline triggers admin operations against Helix; Helix owns the resulting state.

### Implications for Phase 2 (Design A)

Phase 2 still lands as a future enhancement: replace the generic template with on-demand server-side rendering against the storefront's *own* authored template. When that ships, the action returns real product HTML on each admin preview call (instead of the generic template). The pre-publish trigger from Phase 1 keeps working — it just causes more useful HTML to be stored. The §5 template-divergence bug closes the moment Design (A) ships.

The pre-publish step doesn't go away in Phase 2; it remains the mechanism for getting URLs into content-bus. The action's behavior on each call is what changes.

---

## Recommended next steps

1. Update §0 of the original research to reflect Finding 1 (overlay is admin-time, not runtime). The current wording will mislead the next reader.
2. Add a §10 (or extend §5) capturing Finding 2 (case sensitivity) as a Phase 1 gap.
3. Strike §3.1's "residual open items" — Finding 3 closes them.
4. Re-scope Phase 1 implementation around the two concrete pieces above. The pre-publish step is ~3 hours in the extension; link-case normalization is ~30 minutes per template (3 templates we own/can patch).

This addendum is the empirical layer. The original research's locked decisions remain authoritative for direction; this just sharpens what Phase 1 has to actually do.

---

## Reproducibility — exact commands

For the next person who wants to verify any of the above:

```bash
DA_TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.aem/da-token.json','utf8')).access_token);")
GH_TOKEN=$(gh auth token)
SITE=https://main--citisignal-b2b--skukla.aem.live
ADMIN=https://admin.hlx.page

# Finding 1: cold path 404
curl -s -o /dev/null -w "%{http_code}\n" "$SITE/products/droidview-1/droidview1"

# Finding 1: preview+publish, then live works
curl -s -X POST -H "x-auth-token: $GH_TOKEN" \
  -H "x-content-source-authorization: Bearer $DA_TOKEN" \
  "$ADMIN/preview/skukla/citisignal-b2b/main/products/droidview-1/droidview1"
curl -s -X POST -H "x-auth-token: $GH_TOKEN" \
  -H "x-content-source-authorization: Bearer $DA_TOKEN" \
  "$ADMIN/live/skukla/citisignal-b2b/main/products/droidview-1/droidview1"
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" "$SITE/products/droidview-1/droidview1"

# Finding 2: case sensitivity (after the publish above)
curl -s -o /dev/null -w "lowercase: %{http_code}\n" "$SITE/products/droidview-1/droidview1"
curl -s -o /dev/null -w "PascalCase: %{http_code}\n" "$SITE/products/droidview-1/DroidView1"

# Finding 3: live /config.json with browser UA
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
curl -s -o /dev/null -w "%{http_code}\n" -H "User-Agent: $UA" "$SITE/config.json"

# Finding 3: catalog query
ENDPOINT=https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/graphql
curl -s -X POST -H "Content-Type: application/json" \
  -H "Store: citisignal_us" \
  -H "Magento-Store-Code: citisignal_store" \
  -H "Magento-Store-View-Code: citisignal_us" \
  -H "Magento-Website-Code: citisignal" \
  -d '{"query":"{productSearch(phrase:\"\", page_size:10){items{productView{sku urlKey name}}}}"}' \
  "$ENDPOINT"
```
