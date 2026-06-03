# Commerce Connection Kit — connect any EDS storefront (incl. AEM-Sites-authored) to a Demo Builder commerce backend

**Filed:** 2026-06-02
**Status:** **Possible direction** (research / candidate — NOT a committed plan). Pending a product-strategy call + two validation spikes.
**Sits within:** the "commerce-first" product strategy (vs. the larger "solution-family-first" repositioning — see *Product-flow context* below).
**Supersedes:** the earlier "DA.live + AEM Sites dual authoring (two sites / repoless / fork)" framing, now demoted to *Considered & rejected*.

> Research caveat: Adobe doc pages (`www.aem.live`, `experienceleague.adobe.com`) block programmatic fetch (403); the Experience League MCP was not connected. Findings rest on web-search extracts of Adobe's own text + reachable `raw.githubusercontent.com` files. **Re-verify load-bearing specifics (esp. cross-org API Mesh) in a live environment / browser before committing code.** Confidence flagged inline.

## The idea in one line

The extension **provisions/owns the commerce backend** (ACCS/PaaS + API Mesh + Catalog Service) and emits a **"commerce connection kit"** — the endpoints + keys + store headers it *already generates*. **Any** EDS storefront — document-authored *or* AEM-Sites-authored, in *any* Adobe org — becomes a commerce storefront by dropping that config in. The AEM SC stands up an off-the-shelf AEM-authorable commerce storefront in **their own** org and applies the kit.

The shared thing is the **commerce backend (a URL + keys)**, not a code repo and not content. That's what makes it cross-org-native.

## How we got here (why not "dual authoring")

The original goal was "author one storefront from DA.live *and* AEM Sites simultaneously." Research killed that and reshaped it:
- **One EDS site has exactly one content source** — DA *or* AEM author, never both on one site. (HIGH)
- A repo's EDS **code-bus is bound to one org** (canonical-site rule: `org/site` must match GitHub `owner/repo`), so **sharing one code repo across two orgs is unsupported**; the sanctioned cross-org move is *fork into your own org*. (~75%)
- But the **commerce backend is org-agnostic to consume** — so we don't need to share code or content at all. We share the backend. (MEDIUM-HIGH)

## The connection contract (what "connects" a storefront to the backend)

A commerce EDS storefront reads `config.json` (dev) / the Configuration Service `public.json` (prod):
- **Endpoints:** `commerce-core-endpoint` (core GraphQL — cart/checkout), `commerce-endpoint` (Catalog Service / Live Search read path, or the API Mesh URL).
- **Headers:** `x-api-key`, `Magento-Environment-Id` (the Commerce **SaaS data-space** id), `Magento-Store-Code`, `Magento-Store-View-Code`, `Magento-Website-Code`, `Magento-Customer-Group`, `Store`.

**The extension already generates exactly this.** `src/features/eds/services/configGenerator.ts` emits all of the above (ACCS vs PaaS aware), and `src/features/eds/config/config-template.json` is the `public.default` block. Today it writes this *into the storefront repo it creates*; a connection kit is **the same config, exported**. So the kit is ~90% existing code.
- Seams: `configGenerator.ts`, `config-template.json`, `configurationService.ts` (config-service PUT, overlay-capable), `src/features/mesh/services/meshEndpoint.ts` (the mesh URL).
- Sources: [Storefront configuration](https://experienceleague.adobe.com/developer/commerce/storefront/setup/configuration/commerce-configuration/), [Catalog Service GraphQL](https://developer.adobe.com/commerce/services/graphql/catalog-service/).

## Cross-org verdict

- **SaaS read path (Catalog Service / Live Search / Recs): cross-org-safe.** Global multi-tenant endpoints called from the browser with **just `x-api-key` + `Magento-Environment-Id` + store headers — no IMS token**. Keys are scoped to the **Commerce data space**, not the storefront's hosting org. So org B's storefront renders org A's catalog with the shared public key. The org boundary is *administrative* (who mints the key), not runtime. (MEDIUM-HIGH, partly inferred — [Commerce Services Connector](https://experienceleague.adobe.com/en/docs/commerce/user-guides/integration-services/saas), [Catalog Service](https://developer.adobe.com/commerce/services/graphql/catalog-service/))
  → an **ACCS** demo connects cross-org cleanly.
- **API Mesh: validate.** Mechanically callable with a public api-key, but the mesh lives in org A's Adobe I/O project; secured/auth'd meshes or upstreams needing org-A creds can break cross-org. Clean pattern: provision mesh in org A, expose with public key, org B points at the URL. (MEDIUM) → **PaaS** demos (mesh-heavy) are the case to prove out.

## Off-the-shelf AEM-authorable commerce storefront

**`adobe-rnd/aem-boilerplate-xcom`** — carries the Commerce drop-ins (cart/PDP/checkout/account) **and** the xwalk component config (`component-definition/models/filters`) so the commerce blocks are authorable in Universal Editor with AEM Sites as the content source. We do **not** need to build one. Semi-official (`adobe-rnd` org, thinner docs). (HIGH it exists/works; MEDIUM-HIGH "supported".) Sources: [aem-boilerplate-xcom](https://github.com/adobe-rnd/aem-boilerplate-xcom), [aem-boilerplate-commerce](https://github.com/hlxsites/aem-boilerplate-commerce).

## Candidate v1 shape (what the extension might do)

1. **Emit a commerce connection kit** — export the connection config the extension already computes (endpoints + `x-api-key` + environment-id + store headers) as a shareable artifact (the `public.default` JSON snippet) + apply instructions. Surface in **Configure** and/or a dashboard action; record nothing new on the project beyond what exists.
2. **Optionally help the AEM SC scaffold** `aem-boilerplate-xcom` in their org (template-copy — reuses the extension's existing repo-from-template machinery) and apply the kit to its config service.
3. **Guide** the AEM-side steps with no self-serve API (Code Sync, Cloud Manager site, IMS roles, UE enablement).

No content seeding, no code-bus sharing, no fork-sync of the Commerce SC's repo. Effort looks **S–M**.

## Considered & rejected (preserve the rationale)
- **Two sites / repoless / fork of the Commerce repo** — rejected: cross-org code-bus can't be shared; and we don't need shared code, only a shared backend. (Fork-into-own-org remains the sanctioned move *if* someone wants the same storefront *code*, but that's the AEM SC's choice, not something the extension must orchestrate.)
- **Content seeding into AEM** (`@adobe/aem-import-helper`) — not needed here: storefronts are authored independently and share commerce *data*, not editorial content. (Kept on file; medium-effort if ever wanted.)
- **Switchable single content source** (flip DA↔AEM) — fallback only; not "both live."

## Open questions / validation spikes (before committing)
1. **Cross-org API Mesh** — empirical test: stand up `xcom` in org B, point `commerce-endpoint` at a mesh provisioned in org A (public api-key), confirm it renders. Also confirm via the **Adobe customer Slack** (Helix/EDS team, ~1hr SLA).
2. **PDP SEO / prerenderer** — `adobe-rnd/aem-commerce-prerender` is an **App Builder app** (in an Adobe org/project) for crawler-visible PDPs; a real second moving part with its own cross-org wrinkle. May be optional for a live demo.
3. **CORS / domain allow-listing** on the core GraphQL endpoint for the storefront's domain.
4. **Config-service precedence trap** — a stray `config.json` on `main` silently overrides the prod Configuration Service.
5. **`xcom` maturity** — semi-official; expect to read source/release notes.

## Product-flow context
This direction is the **"commerce-first + connection handoff"** option (extension stays commerce-focused; the AEM SC owns their storefront/authoring). It does **not** require the larger **"solution-family-first"** repositioning (which the codebase isn't shaped for — no `solution/product` abstraction; commerce is baked into the step-condition vocabulary, `COMPONENT_IDS`/`isEdsStackId` conventions, and the fixed `executor` pipeline). Solution-family remains a separate, deliberate bet for when a second standalone product is greenlit.

## Sources (primary unless marked)
- [aem.live config-service-setup](https://www.aem.live/docs/config-service-setup), [repoless](https://www.aem.live/docs/repoless), [FAQ](https://www.aem.live/docs/faq)
- [adobe/helix-home architecture.md](https://raw.githubusercontent.com/adobe/helix-home/main/docs/architecture.md) (code-bus owner/repo binding)
- [adobe-rnd/aem-boilerplate-xcom](https://github.com/adobe-rnd/aem-boilerplate-xcom), [hlxsites/aem-boilerplate-commerce](https://github.com/hlxsites/aem-boilerplate-commerce)
- [Storefront configuration](https://experienceleague.adobe.com/developer/commerce/storefront/setup/configuration/commerce-configuration/), [Catalog Service](https://developer.adobe.com/commerce/services/graphql/catalog-service/), [Commerce Services Connector (data-space keys)](https://experienceleague.adobe.com/en/docs/commerce/user-guides/integration-services/saas)
- [API Mesh](https://developer.adobe.com/graphql-mesh-gateway/), [AEM Commerce Prerender](https://github.com/adobe-rnd/aem-commerce-prerender)
