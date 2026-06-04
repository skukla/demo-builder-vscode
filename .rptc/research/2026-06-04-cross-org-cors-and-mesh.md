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

## Addendum (2026-06-04): the AEM Configuration Service is a fourth way

The original three-way enumeration ((1) same-origin, (2) API Mesh, (3) direct PaaS allow-list) covered the **Commerce backend** side. There is a fourth path that lives on the **EDS storefront** side, surfaced during the post-research ExL dig into the Configuration Service ([`config-service-setup`](https://www.aem.live/docs/config-service-setup)):

- **Configuration-Service site headers** — `POST /config/{org}/sites/{site}/headers.json` accepts arbitrary HTTP response headers per path pattern, including `access-control-allow-origin`. Example from the doc:
  ```bash
  curl -X POST https://admin.hlx.page/config/{org}/sites/{site}/headers.json \
    -H 'content-type: application/json' \
    -H 'x-auth-token: {your-auth-token}' \
    --data '{ "/**": [{ "key": "access-control-allow-origin", "value": "*" }] }'
  ```

This sets CORS on the **storefront's** responses at the AEM-managed CDN — orthogonal to the Commerce backend's CORS posture. It does **not** help the storefront's calls *out* to the Commerce backend (the original CORS question), so it does **not** change the recommendation above. But:

- It is **the easiest way to set CORS for any backend that consumes the EDS storefront's API** (e.g. an embedded widget calling back into the storefront). The two-SC plan doesn't need this today, but it is a likely concern for "shoppable AEM content" or App Builder integrations that surface storefront data.
- It is **the SaaS / repoless equivalent** of dropping `nginx.conf` headers on a PaaS Commerce. Same intent (set ACAO at the edge), no server/codebase access required, no mesh required.

**Net:** the recommendation is unchanged for the cross-org commerce path. The four-way enumeration is the complete EDS-storefront-plus-Commerce CORS picture.

## Addendum (2026-06-04): cross-account read path strengthened

The deciding question above asked whether ACCS handles CORS at the edge. While verifying that, the dig also surfaced a stronger result for the **read** half of the cross-account story than the original research recorded.

Adobe's Merchandising API docs state directly:

> "Authentication is not required for the Merchandising API." — [Get started with the Merchandising API](https://developer.adobe.com/commerce/services/optimizer/merchandising-services/using-the-api) (SaaS-only badged)

The required headers are `AC-View-ID` + `AC-Source-Locale`; optional `AC-Price-Book-ID` and `AC-Policy-{name}`. All are public identifiers (visible in any client-side session). The tenant binding lives in the URL path: `https://{region}.api.commerce.adobe.com/{tenantId}/graphql`. No `x-api-key`, no `Authorization`, no IMS token.

That explains the literal `"X-Api-Key": "not_used"` in the [ACCS API Mesh example](https://developer.adobe.com/graphql-mesh-gateway/mesh/best-practices/commerce-cloud-service/) — the endpoint ignores it. So in the two-SC plan, the Content SC's storefront calls the Merchandising API for org A's catalog with values org A already publishes (`tenantId`, view ID, locale). **Nothing crosses a trust boundary because there is no trust boundary to cross.** The cross-account-read story is on firmer ground than the original "read path needs only a URL + public keys" phrasing.

## Sources

- [CORS Setup](https://experienceleague.adobe.com/developer/commerce/storefront/setup/configuration/cors-setup/)
- [CORS Troubleshooting](https://experienceleague.adobe.com/developer/commerce/storefront/setup/configuration/cors-troubleshooting/)
- [Storefront CDN](https://experienceleague.adobe.com/developer/commerce/storefront/setup/configuration/content-delivery-network/)
- [API Mesh — CORS headers](https://developer.adobe.com/graphql-mesh-gateway/mesh/advanced/cors/)
- [API Mesh — best practices for Adobe Commerce as a Cloud Service](https://developer.adobe.com/graphql-mesh-gateway/mesh/best-practices/commerce-cloud-service/)
- [Storefront architecture](https://experienceleague.adobe.com/developer/commerce/storefront/get-started/architecture/)
- [Fastly dynamic cache control (API Mesh)](https://developer.adobe.com/graphql-mesh-gateway/gateway/fastly/)

### Added 2026-06-04 (post-research ExL dig)

- [Setting up the Configuration Service](https://www.aem.live/docs/config-service-setup) — `/headers.json` for CORS at the EDS-storefront edge; "repoless" multi-site-one-repo model.
- [Get started with the Merchandising API](https://developer.adobe.com/commerce/services/optimizer/merchandising-services/using-the-api) — "Authentication is not required" verbatim; required header set is `AC-View-ID` + `AC-Source-Locale`.
- [Set up your storefront (ACO)](https://experienceleague.adobe.com/en/docs/commerce/optimizer/storefront) — SaaS-only setup flow: paste `tenantId` + endpoint into `config.json`; no CORS step in the path.
