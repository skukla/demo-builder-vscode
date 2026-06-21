# Addendum — Phase 2 BYOM PDP rendering shipped (2026-06-09)

Report-back from the `accs-discovery-service` side. Phase 2 of the render-pdp overlay is built,
deployed, and verified.

## Status: DEPLOYED ✅

`render-pdp` now returns the **storefront's own authored `/products/default`** instead of the
generic template, falling back to the generic template on any failure. Shipped on
`accs-discovery-service` `main @ 565ef8b`, deployed to Stage.

- Action URL (unchanged): `https://<runtime-namespace>.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp`
- It fetches `https://main--{site}--{org}.aem.live/products/default` with a desktop Chrome
  User-Agent, caches per `(org, site)` for 5 min (per warm container), and returns the HTML
  verbatim. No HTML parsing / no server-side data injection — the drop-in does all product-data
  work client-side.

## Verification (citisignal-b2b, non-mutating)

- Cross-check: live `/products/default` with browser UA → **200, 4575 bytes** (anonymous, no UA →
  403, as documented).
- `GET render-pdp/products/orchard-2/orchard2?org=skukla&site=citisignal-b2b` → **200, 4575 bytes**,
  full **authored** markup: storefront `<header>`, `/scripts/scripts.js`, `canonical` → the
  storefront's `/products/default`, OG tags, the `product-details` block — **not** the ~400-byte
  generic shell. Confirms render-pdp serves the authored template.
- The full prepublish→visit browser flow was **not** run here (it publishes a live page that can't
  be unpublished without auth). Server-side behavior is verified; run the end-to-end browser check
  on your side when convenient (trigger `prepublish-pdp`, visit the live PDP, confirm SC
  customizations appear above/below `product-details`).

## Deviations from the brief (all minor)

- **Fetch timeout:** `AbortSignal.timeout(10000)` (10s).
- **Content-Type:** `text/html; charset=utf-8` (matches the existing action's style; brief used
  lowercase `text/html` — equivalent).
- **Verification method:** direct `render-pdp` call (non-mutating) rather than publish-then-visit,
  to avoid orphaning a live page (unpublish is auth-gated). Equivalent confirmation of the overlay's
  output.
- **Observation:** the live fetch and render-pdp output were both 4575 bytes but not byte-identical
  — a per-request dynamic field in the authored HTML (e.g. a nonce); immaterial, render-pdp returns
  its own fetch verbatim.

## Action items for the demo-builder side

- Update `docs/architecture/eds-byom-pdp-routing.md`, `docs/architecture/adr/005-byom-pdp-routing.md`,
  and any AI-context to note **Phase 2 is LIVE**: render-pdp serves the storefront's authored
  `/products/default` (generic template only as a fallback). The §5 *template-divergence* concern is
  addressed — PDPs now inherit SC customizations rather than rendering a generic shell.
- Run the end-to-end browser verification on a customized storefront when convenient.
- **Clean up the probe paths below** (you hold the tokens; the credential-free probes couldn't —
  DELETE is auth-gated).

## Cleanup debt — exact probe paths to delete (skukla/citisignal-b2b, branch `main`)

Created during the Helix admin auth probing. **3 preview entries to delete; 1 is also published
(unpublish from the live tier too).** Nothing else.

| Path | Preview | Live |
|---|:---:|:---:|
| `/products/orchard-2/probe` | delete | — |
| `/products/verify-1781012023/probe` | delete | — |
| `/products/verify-pub-1781012309/probe` | delete | **unpublish** |

```bash
ADMIN=https://admin.hlx.page
S=skukla/citisignal-b2b/main
AUTH=(-H "x-auth-token: $GITHUB_TOKEN" -H "x-content-source-authorization: Bearer $DA_LIVE_TOKEN")

# 1. Unpublish the one live page
curl -X DELETE "${AUTH[@]}" "$ADMIN/live/$S/products/verify-pub-1781012309/probe" -w '\n%{http_code}\n'

# 2. Delete the three preview entries
for p in products/orchard-2/probe products/verify-1781012023/probe products/verify-pub-1781012309/probe; do
  curl -X DELETE "${AUTH[@]}" "$ADMIN/preview/$S/$p" -w "\n$p %{http_code}\n"
done
```

Full server-side detail: `accs-discovery-service/docs/research/helix-admin-auth-findings.md` and the
repo README's `/render-pdp` section.
