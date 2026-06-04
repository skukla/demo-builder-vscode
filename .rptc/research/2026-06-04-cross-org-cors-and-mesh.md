# Research: Cross-org CORS & API Mesh for the two-party storefront

**Filed:** 2026-06-04 · Verifies the CORS allow-list requirement that the commerce-connect design flagged but **deferred**. **Method:** Adobe-doc triangulation via web search — both `experienceleague.adobe.com` and `developer.adobe.com` return **403 to programmatic fetch** (the standing "Adobe docs block fetch" caveat held), so claims are from search-surfaced doc content across several queries, with **confidence flagged per claim** and sources listed.

## Question

Does a content-SC storefront (on its own domain) need CORS allow-listing to transact against the commerce-SC's backend — and what is Adobe's best-practice way to satisfy it **without touching a PaaS backend** (we are ACCS-first)?

## What CORS is (why it bites here)

A browser blocks a page on domain A from reading responses from domain B unless B returns `Access-Control-Allow-Origin` naming A. The content SC's storefront (their domain) calling the commerce backend (different org/domain) is cross-origin by definition → blocked unless *something* allows that origin.

## Findings

1. **CORS applies cross-domain — CONFIRMED (HIGH).** Adobe has dedicated storefront [CORS Setup] and [CORS Troubleshooting] pages. Allowed origins must be the **exact** origin (scheme + host + port); wildcard `*` is for dynamic EDS preview URLs, specific origins for production; `*` is incompatible with credentials.

2. **Three ways to satisfy it, in Adobe's stated preference order:**
   - **Same-origin via CDN/Fastly proxy — Adobe's #1 production best practice.** Storefront + `/graphql` served from one domain; CORS disappears. **Requires a shared domain → NOT available cross-org.** (Mode A / single-org only.)
   - **API Mesh — Adobe's "right default for most real-world implementations."** Storefront → mesh; the mesh sets CORS via a `responseConfig.cors` block (`origin`, `methods`, `allowedHeaders`, `credentials`, `exposedHeaders`, `maxAge`); the **mesh→backend call is server-side — no browser CORS.**
   - **Direct backend allow-list — fallback.** Add the origin to the backend's Allowed Origins; on PaaS, `bin/magento cache:flush` after (stale cache is the #1 "it's broken" cause). ← the PaaS-flavored path we avoid.

3. **The storefront calls two endpoint classes (HIGH).** Core Commerce GraphQL (cart/checkout — transactional, the CORS-sensitive one) and the SaaS services (Catalog Service / Live Search via public `x-api-key`, Adobe-managed). A mesh unifies both behind one CORS-controlled endpoint.

4. **ACCS-first + per-org mesh = no backend config at all (HIGH on mechanism).** ACCS is SaaS — there is **no PaaS backend to configure**. Adobe's recommended ACCS consumption pattern is **via API Mesh**. With each party fronting the backend with **their own mesh in their own org**, CORS is configured **inside that mesh** (their App Builder), and the mesh reads ACCS server-side with the **public key**. Nobody edits a backend, and the cross-org allow-list handshake disappears.

5. **The direct CORS-config page is explicitly "PaaS only" (HIGH — confirmed from the doc source).** [`cors-setup.mdx`](https://github.com/commerce-docs/microsite-commerce-storefront/blob/release/src/content/docs/setup/configuration/cors-setup.mdx) carries a **`PaaS only`** badge; its three mechanisms — web-server (nginx/apache) headers, the `graycore/magento2-cors` third-party module, or a custom Magento module — all require server/codebase access. **No SaaS/ACCS instructions exist.** ⇒ the "commerce party manually allow-lists the content domain" handshake is a **PaaS artifact that does not exist on ACCS** — on SaaS there is no knob to turn. So on ACCS the only ways to satisfy a cross-domain storefront are: **(a) your own per-org mesh**, or **(b) ACCS already returning CORS headers for storefront origins at its edge** (plausible — EDS storefronts are built to be consumed cross-domain — but **unverified**).

## Impact on the engagement model

- The earlier "commerce-SC allow-lists the content domain + bidirectional handshake" is **only the direct-backend (no-mesh) path.** With the recommended **ACCS-first + per-org mesh**, CORS is **self-contained in each party's own org** and the cross-org handshake **dissolves**. Mode C is *less* brittle than recorded — *provided* it is fronted by per-org meshes.
- **Same-origin** (Adobe's global best practice) needs one shared domain → it is the **Mode A / single-org** option only, never cross-org.

## The deciding question — documentation indicates YES (ACCS handles CORS at the edge)

**Does ACCS return CORS headers for arbitrary storefront origins out of the box?** Adobe's docs answer this *indirectly but consistently* (no single explicit ACAO sentence for `/graphql`, so triangulated):

- **Read path — CORS-open by design (HIGH).** Catalog Service / Live Search are called **directly from the storefront browser** at `catalog-service.adobe.io/graphql` (client-side PLP, per the connection + Live Search docs). A SaaS endpoint browser-called from arbitrary domains must return `Access-Control-Allow-Origin` for any origin.
- **CORS config is PaaS-only (HIGH).** Both CORS pages are badged `PaaS only`; Adobe never instructs a SaaS user to configure CORS → the SaaS edge handles it.
- **ACCS is fully Adobe-operated SaaS on the EDS + API-Mesh edge (HIGH on architecture)**, and the core endpoint **needs no api-key by default** — built for direct storefront consumption.
- **Residual — core/transactional (cart/checkout) endpoint ACAO not explicitly stated (MEDIUM-HIGH).** Strongly implied by the above; confirm with one live `Origin`-header request (kept in the spike).

**Net: a mesh is NOT required for CORS on ACCS.**

## Still to verify live

- **The transactional endpoint's ACAO (one request)** + **cross-org transacting (cart/checkout WRITES) end-to-end** — CORS is necessary, possibly not sufficient. Both in the spike.

## Recommendation

**Do NOT mandate the mesh.** Documentation indicates ACCS handles cross-origin at the edge and the read path is browser-direct by design, so on ACCS the mesh is **likely not needed for CORS at all** — and there is no PaaS-style manual allow-list handshake on SaaS either way. Keep the mesh **optional** (the config generator already supports a direct backend URL); reserve it for cases where the transactional endpoint turns out *not* to auto-allow. Same-origin is Mode-A (single-org) only.

## Sources

- [CORS Setup](https://experienceleague.adobe.com/developer/commerce/storefront/setup/configuration/cors-setup/)
- [CORS Troubleshooting](https://experienceleague.adobe.com/developer/commerce/storefront/setup/configuration/cors-troubleshooting/)
- [Storefront CDN](https://experienceleague.adobe.com/developer/commerce/storefront/setup/configuration/content-delivery-network/)
- [API Mesh — CORS headers](https://developer.adobe.com/graphql-mesh-gateway/mesh/advanced/cors/)
- [API Mesh — best practices for Adobe Commerce as a Cloud Service](https://developer.adobe.com/graphql-mesh-gateway/mesh/best-practices/commerce-cloud-service/)
- [Storefront architecture](https://experienceleague.adobe.com/developer/commerce/storefront/get-started/architecture/)
- [Fastly dynamic cache control (API Mesh)](https://developer.adobe.com/graphql-mesh-gateway/gateway/fastly/)
