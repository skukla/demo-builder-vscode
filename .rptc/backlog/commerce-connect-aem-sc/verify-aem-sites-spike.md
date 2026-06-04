# Spike: verify AEM Sites authoring + transacting (gates the build)

**Filed:** 2026-06-04 · The verification the [roadmap](./roadmap.md) puts **before any build**. Needs a **live Adobe environment** — it can't be done from the repo, and Adobe docs block programmatic fetch.

## The question (just one)

Can an **`aem-boilerplate-xcom`** storefront be **authored via AEM Sites** (Universal Editor, in its own Adobe org) **and transact** against an Adobe Commerce backend?

- **Pass:** an AEM-authored page renders via Edge Delivery, shows live products/prices from the backend, and a shopper can add to cart and reach checkout.
- **Fail / flag:** any step that can't be done with standard tooling, needs undocumented steps, or breaks the transaction.

## Why this gates everything

It's the **spine** of the locked target ([storefront-topology](./storefront-topology.md)) and the one thing the extension can't do today (it's DA.live-only). If it holds, the rest is "two of these sharing an upstream" — mostly reuse. **Desk research (June 2026) says it should:** xcom exists for exactly this, and AEM-as-content-source is a standard EDS capability. So the spike is to confirm it **end-to-end (especially transacting)** and surface the wrinkles — not to discover whether it's possible.

## Prerequisites

- An **AEM as a Cloud Service author instance** (the Content-SC side), in an Adobe org.
- An Adobe **Commerce backend** (PaaS or ACCS) with Catalog Service / Live Search, reachable (URL + public keys).
- A **GitHub** account + ability to install the **AEM Code Sync** app.
- The **AEM Commerce Prerenderer** tool (xcom now uses this for product detail pages — folder mapping is deprecated).

## Steps

1. **Create the repo** from the `adobe-rnd/aem-boilerplate-xcom` template.
2. **Install the AEM Code Sync GitHub app** on the repo (syncs code GitHub → EDS).
3. **Point content at AEM:** edit `fstab.yaml` — replace the default content-source URL with your **AEM author instance** URL.
4. **Author a page in Universal Editor** on the AEM author instance; publish.
5. **Wire commerce:** copy the boilerplate `config.json` to the repo root; set the endpoints/headers to **your** Commerce backend (`commerce-core-endpoint` + `commerce-endpoint`).
6. **Make PDPs resolve, then transact:** PDP URLs need *a* routing mechanism — for the spike, configure the (deprecated but still functional) **folder mapping**, which renders client-side and **transacts** with no App Builder. Then: product list (Live Search/Catalog) → PDP → add to cart → reach checkout.
7. **CORS:** allow-list the storefront domain on the backend.
8. **(Build-time, not spike) Prerenderer:** the **AEM Commerce Prerenderer** (an App Builder app) is the *forward* PDP-routing choice — real per-product HTML via content-overlay, with fallback to the AEM-authored content source. It's the durable replacement for folder mapping (deprecated), needed for SEO/crawlable PDPs — **not** to transact. Confirm in the spike which routing the current xcom ships with by default.

## Record at each step (this feeds straight back into the plan)

- Which steps need **Adobe-org-side** actions → these are the parts the Content-SC's *own* extension must do in *their* org (not the Commerce SC's), confirming Scenario B's division of labor.
- Whether the **backend read works cross-org** (backend in org A, storefront in org B) with only URL + public keys.
- Whether the **Prerenderer** is a per-fork dependency (affects the build + the "transact" path).
- Any step that's **manual/undocumented** → net-new extension work.
- CORS specifics (what domains/headers the backend must allow).

## What desk research already confirmed (June 2026, web search)

- **xcom is purpose-built for this** — "all the changes on top of `aem-boilerplate-commerce` to author content and commerce blocks in-context with Universal Editor."
- **AEM-as-content-source is standard** — install the Code Sync app + set `fstab.yaml` to the AEM author instance; content persists in AEM JCR, code in GitHub, EDS fetches each.
- **Backend connection is `config.json`** (endpoints + headers) — copy the demo, point at your backend; cart/checkout/product dropins ship in the boilerplate.
- **PDP routing needs a mechanism (not free), but not the prerenderer to transact:** product URLs resolve via **either** (deprecated-but-functional) **folder mapping** (client-side data; quick; soft-404s/thin HTML) **or** the **AEM Commerce Prerenderer** (App Builder app; real per-product HTML via content-overlay, falling back to the AEM-authored source). A shopper can transact under folder mapping. Because folder mapping is deprecated, the prerenderer is the **durable build-time** PDP-routing choice — per fork, in its org — but it's never a transaction/spike blocker. *(Confidence: from doc/GitHub summaries — the aem.live writeup 403'd to fetch; the live spike confirms the exact default.)*
- Sources: [Set Up AEM Sites as a Content Source](https://www.aem.live/developer/ue-tutorial) · [adobe-rnd/aem-boilerplate-xcom](https://github.com/adobe-rnd/aem-boilerplate-xcom) · [Storefront boilerplate configuration](https://experienceleague.adobe.com/developer/commerce/storefront/boilerplate/configuration/)

## Outcome → next move

- **Pass** → start the build at roadmap step 1 (the shared upstream), confident the spine holds.
- **Fail/flag on a specific step** → bring it back; it likely localizes to one of: the Prerenderer, cross-org backend read, or CORS — each of which has a fallback.
