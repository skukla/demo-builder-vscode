# Commerce Connection Kit — connect any EDS storefront (incl. AEM-Sites-authored) to a Demo Builder commerce backend

**Filed:** 2026-06-02
**Status:** **Leading direction** (per discovery — pending `/rptc:plan`). No remaining technical gates.
**Operator model:** [Federated two-instance demos](./2026-06-02-federated-two-instance-demos.md) — each SC runs their own extension copy and manages their piece; this kit is the contract between them.
**Sits within:** the "commerce-first" product strategy (vs. the larger "solution-family-first" repositioning — see *Product-flow context* below).
**Supersedes:** the earlier "DA.live + AEM Sites dual authoring (two sites / repoless / fork)" framing, now demoted to *Considered & rejected*.

> Research caveat: Adobe doc pages (`www.aem.live`, `experienceleague.adobe.com`) block programmatic fetch (403); the Experience League MCP was not connected. Findings rest on web-search extracts of Adobe's own text + reachable `raw.githubusercontent.com` files. **Re-verify load-bearing specifics (esp. cross-org API Mesh) in a live environment / browser before committing code.** Confidence flagged inline.

## The idea in one line

The Commerce SC provisions/owns the commerce backend (ACCS/PaaS + API Mesh + Catalog Service) and **publishes their DA.live storefront** (today's flow — assumed always present). That storefront serves its `config.json` **publicly** — endpoints + **public read keys** (`x-api-key`, `Magento-Environment-Id`) + store headers — because the storefront is a client-side app that calls those endpoints from the browser. So the connection values are *already published*. The AEM SC stands up an off-the-shelf AEM-authorable commerce storefront (`aem-boilerplate-xcom`) in **their own** org and **discovers** those values from the Commerce SC's published storefront URL.

The shared thing is the **commerce backend**, reached via values the storefront already publishes — not a code repo, not content, and **not a hand-off**. Discovery, not export. That's what makes it cross-org-native *and* low-friction.

## How we got here (why not "dual authoring")

The original goal was "author one storefront from DA.live *and* AEM Sites simultaneously." Research killed that and reshaped it:
- **One EDS site has exactly one content source** — DA *or* AEM author, never both on one site. (HIGH)
- A repo's EDS **code-bus is bound to one org** (canonical-site rule: `org/site` must match GitHub `owner/repo`), so **sharing one code repo across two orgs is unsupported**; the sanctioned cross-org move is *fork into your own org*. (~75%)
- But the **commerce backend is org-agnostic to consume** — so we don't need to share code or content at all. We share the backend. (MEDIUM-HIGH)

## The connection contract (what "connects" a storefront to the backend)

A commerce EDS storefront reads `config.json` (dev) / the Configuration Service `public.json` (prod):
- **Endpoints:** `commerce-core-endpoint` (core GraphQL — cart/checkout), `commerce-endpoint` (Catalog Service / Live Search read path, or the API Mesh URL).
- **Headers:** `x-api-key`, `Magento-Environment-Id` (the Commerce **SaaS data-space** id), `Magento-Store-Code`, `Magento-Store-View-Code`, `Magento-Website-Code`, `Magento-Customer-Group`, `Store`.

**The extension already generates exactly this.** `src/features/eds/services/configGenerator.ts` emits all of the above (ACCS vs PaaS aware), and `src/features/eds/config/config-template.json` is the `public.default` block. The Commerce SC's storefront publishes it; the AEM side **discovers the same shape back** from that published config. So both producing and reading these values is existing code.
- Seams: `configGenerator.ts`, `config-template.json`, `configurationService.ts` (config-service PUT, overlay-capable), `src/features/mesh/services/meshEndpoint.ts` (the mesh URL).
- Sources: [Storefront configuration](https://experienceleague.adobe.com/developer/commerce/storefront/setup/configuration/commerce-configuration/), [Catalog Service GraphQL](https://developer.adobe.com/commerce/services/graphql/catalog-service/).

## Cross-org verdict

- **SaaS read path (Catalog Service / Live Search / Recs): cross-org-safe.** Global multi-tenant endpoints called from the browser with **just `x-api-key` + `Magento-Environment-Id` + store headers — no IMS token**. Keys are scoped to the **Commerce data space**, not the storefront's hosting org. So org B's storefront renders org A's catalog with the shared public key. The org boundary is *administrative* (who mints the key), not runtime. (MEDIUM-HIGH, partly inferred — [Commerce Services Connector](https://experienceleague.adobe.com/en/docs/commerce/user-guides/integration-services/saas), [Catalog Service](https://developer.adobe.com/commerce/services/graphql/catalog-service/))
  → an **ACCS** demo connects cross-org cleanly.
- **API Mesh: org-agnostic to consume (resolved).** Demos are **ACCS-first**, so the SaaS read path above is the norm anyway. And even for a mesh: consuming a *deployed* mesh is org-agnostic — it's a GraphQL URL + `x-api-key`; the mesh resolves its **upstream** sources internally with *their* creds, transparent to the caller. A storefront in org B calling org A's mesh needs only the URL + key; the mesh's IMS org doesn't enter the runtime path. (Confirmed by SC domain input + the public-api-key mesh model.) Only a deliberately locked-down mesh would differ — not how the extension deploys them.

## Off-the-shelf AEM-authorable commerce storefront

**`adobe-rnd/aem-boilerplate-xcom`** — carries the Commerce drop-ins (cart/PDP/checkout/account) **and** the xwalk component config (`component-definition/models/filters`) so the commerce blocks are authorable in Universal Editor with AEM Sites as the content source. We do **not** need to build one. Semi-official (`adobe-rnd` org, thinner docs). (HIGH it exists/works; MEDIUM-HIGH "supported".) Sources: [aem-boilerplate-xcom](https://github.com/adobe-rnd/aem-boilerplate-xcom), [aem-boilerplate-commerce](https://github.com/hlxsites/aem-boilerplate-commerce).

## Candidate v1 shape (what the extension might do)

**Commerce side: nothing new** — the Commerce SC builds/publishes their DA.live storefront as today; its public config *is* the connection source.

**AEM side:**
1. **Discover** — the AEM SC enters the Commerce demo's published storefront URL; the extension fetches its `config.json` / Configuration Service `public.json` and extracts the commerce subset (endpoints + `x-api-key` + environment-id + store headers). Extends the extension's existing store-discovery machinery.
2. **Scaffold** `aem-boilerplate-xcom` in the AEM SC's org (template-copy — reuses the existing repo-from-template machinery) and write the discovered values into its config service.
3. **Guide** the AEM-side steps with no self-serve API (Code Sync, Cloud Manager site, IMS roles, UE enablement).

No export/import file, no content seeding, no code-bus sharing, no fork. Effort looks **S–M** (lighter than the export model — the Commerce side is a no-op).

## What exists today, the two meanings of "connect", and how to start

**What exists today.** The `demoBuilder.daLive.aemAuthorUrl` / `IMSOrgId` settings (`applyDaLiveOrgConfigSettings`, `edsHelpers.ts:537-580`) wire a **UE punch-out** on the Commerce SC's *DA* content. A real "specify an AEM instance" seam — but it delivers the **shared canvas**, not a separate AEM Sites storefront.

**Two meanings of "connect to AEM" — keep them distinct:**

| | Shared canvas (UE-on-DA — *exists today*) | Separate AEM storefront (*this direction*) |
|---|---|---|
| Driven by | Commerce SC (specifies the AEM IMS org) | AEM SC (their own instance) |
| Mechanism | UE punch-out on the Commerce SC's DA content | `xcom` storefront + **discover** commerce |
| Storefronts | one (the Commerce SC's) | one, authored by the AEM SC |
| Content store | DA (one) | AEM JCR (the AEM SC's own) |

**The canonical *use case* for this direction** (note: the *use case*, not a "canonical repo"): one storefront whose experience is authored by the **AEM SC in Universal Editor in *their own* AEM Sites instance**, rendering the **Commerce SC's** catalog. The Commerce SC merely **publishes** their storefront; the AEM SC **discovers** the commerce connection from its URL — no hand-off. *(This storefront is the AEM SC's, in their org — distinct from the "shared upstream / canonical repo" concept in the [federated doc](./2026-06-02-federated-two-instance-demos.md) and [ADR-003](../../docs/architecture/adr/003-multisite-architecture-seam.md).)*

**Discovery, and the extension *can* create the EDS site.** Run from the AEM SC's *own* extension instance: enter the Commerce demo URL → **discover** the connection → **scaffold `xcom`** in their org → apply → **guide** the no-API steps (Code Sync, Cloud Manager, IMS). The cross-org limit is narrow — it only governs *who runs it* (the AEM SC's instance, not the Commerce SC's). Nothing is handed off but the URL.

**How to start (on-ramp):**
1. **Harden the shared canvas** — promote the `aemAuthorUrl`/`IMSOrgId` settings into a first-class surface. Smallest step; it's what exists.
2. **AEM-side discovery flow** — URL → discover → scaffold `xcom` → guided wiring → author. Additive, commerce-anchored; **not** product selection.
3. **Product selection** (later, deliberate) — AEM as a *standalone* product → the solution-family refactor. A separate bet; see *Product-flow context* below.

## Considered & rejected (preserve the rationale)
- **Two sites / repoless / fork of the Commerce repo** — rejected: cross-org code-bus can't be shared; and we don't need shared code, only a shared backend. (Fork-into-own-org remains the sanctioned move *if* someone wants the same storefront *code*, but that's the AEM SC's choice, not something the extension must orchestrate.)
- **Content seeding into AEM** (`@adobe/aem-import-helper`) — not needed here: storefronts are authored independently and share commerce *data*, not editorial content. (Kept on file; medium-effort if ever wanted.)
- **Switchable single content source** (flip DA↔AEM) — fallback only; not "both live."
- **Export/import a connection-kit *file*** — rejected: the connection values are **published** (the storefront serves its config publicly; the keys are public read keys), so the AEM SC **discovers** them from the Commerce SC's storefront URL. A file hand-off would add a manual step *and* a staleness problem for data that's already public and live. (The "kit" survives as the *concept* — the set of values — but delivery is discovery.)

## Open questions / minor notes (none are gates)
1. **Cross-org consumption — resolved.** ACCS-first → SaaS read path is cross-org-clean (no IMS token). Mesh consumption is org-agnostic (URL + api-key; mesh handles upstream auth internally). Not a gate. Trivially testable only if a deliberately locked-down mesh is ever in play.
2. **PDP SEO / prerenderer — OPTIONAL, *not* a build requirement.** `adobe-rnd/aem-commerce-prerender` is an App Builder app that server-renders product pages for **crawlers/LLMs (SEO)**. PDPs render **client-side** via the drop-ins, so a live demo works without it. It is **not** AEM-Sites-specific (same concern for DA- and AEM-authored commerce storefronts), and **the extension does not touch prerendering today** — its current commerce demos work without it. Track only if a build ever needs crawlable/indexable PDPs; it is not a gate for this direction.
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
