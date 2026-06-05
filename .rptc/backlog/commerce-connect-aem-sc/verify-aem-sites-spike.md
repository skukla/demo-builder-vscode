# Spike: verify AEM Sites authoring + transacting (setup → test)

**Filed:** 2026-06-04 · **Closed:** 2026-06-05 — answered by existence proof. Kept as a reference runbook in case a fresh end-to-end is ever needed against new infrastructure.

## Closed by existence proof (2026-06-05)

The spike's question — "Can an `aem-boilerplate-xcom` storefront be authored via AEM Sites and transact?" — is **answered YES** by the existence of [`roberttoddhoven/citisignal-one`](https://github.com/roberttoddhoven/citisignal-one):

- Public repo, Apache 2.0
- `xcom`-shaped: `component-definition.json` / `component-models.json` / `component-filters.json` / `helix-query.yaml` / `blocks` / commerce drop-ins
- Authored via AEM Sites — content tree at `/content/rth-citisignal-one/...` in a working AEM Author instance
- Multi-environment configs as content (`configs`, `configs-stage`, `configs-dev`) via `paths.json` mapping — see the [storefront-topology Configuration-as-content section](./storefront-topology.md#configuration-as-content-the-citisignal-pattern)
- Running in production demo use

The architectural pattern is in production. The spike's end-to-end probe is **not a build gate** — we have a worked example.

## One residual probe (optional, not a gate)

**Cross-account cart/checkout transacting** — the read path is closed by [Adobe's Merchandising API docs](https://developer.adobe.com/commerce/services/optimizer/merchandising-services/using-the-api) ("Authentication is not required"). The write path (cart/checkout against ACCS from a storefront in a different Adobe org) wasn't tested live. A single `Origin`-header request against the ACCS core-commerce endpoint would close the question definitively. Worth running at convenience; **not gating** because documentation triangulation indicates ACCS handles cross-origin at the edge.

---

> The runbook below predates the existence proof. It is preserved verbatim in case a fresh end-to-end test is ever wanted against new infrastructure. **Do not block Slice 1 on running it.**

---

## The question (just one)

Can an **`aem-boilerplate-xcom`** storefront be **authored via AEM Sites** (Universal Editor, in its own Adobe org) **and transact** against a commerce backend?

- **Pass:** an AEM-authored page renders via Edge Delivery, shows live products/prices, and a shopper can add to cart and reach checkout.
- **Fail / flag:** any step that can't be done with standard tooling, needs undocumented steps, or breaks the transaction.

Desk research says this *should* work (xcom exists for exactly this; AEM-as-content-source is standard) — so the spike is **end-to-end confirmation, especially transacting**, not "is it possible."

---

## Phase 0 — Secure & set up the environment

### 0a. The ONE thing you must secure (the gated dependency)
An **AEM as a Cloud Service _Author_ instance with an Edge Delivery Services license.**
- Provisioned through **Cloud Manager** — if your org has the EDS/AEM Sites license, you can "**Create an Edge Delivery site**" (one-click) in Cloud Manager.
- **Only the Author tier is required** (EDS handles delivery; no publish tier needed).
- **This is entitlement-dependent** — the exact route differs by access (Adobe-internal demo program vs. a customer Cloud Manager vs. a sandbox). This is the thing you're currently blocked on; the rest below is self-serve.

### 0b. Self-serve (do today, no entitlement needed)
- A **GitHub account** (+ ability to install a GitHub App).
- The **AEM Sidekick** browser extension.
- **Node/npm**, then `npm install -g @adobe/aem-cli`.

### 0c. Commerce backend — use the sample, don't provision
The boilerplate ships **pre-configured against a sample Adobe Commerce backend**, so you can prove transacting **without standing up your own**:
- Sample config: `https://main--aem-boilerplate-commerce--hlxsites.aem.live/config.json`.
- Use it for the spike; swap in your own backend only later (cross-org read is a *separate* later check). This removes commerce provisioning from the critical path.

---

## Phase 1 — Wire up the storefront
*(Authoritative click-by-click: the aem.live "Set Up AEM Sites as a Content Source" tutorial. Note: that tutorial uses the non-commerce `aem-boilerplate-xwalk`; here we apply the same path to `aem-boilerplate-xcom` — confirming xcom authors cleanly via AEM Sites is part of what the spike validates.)*

1. **Create the repo** from the `adobe-rnd/aem-boilerplate-xcom` template.
2. **Install the AEM Code Sync GitHub App** on the repo (syncs code GitHub → EDS).
3. **Configure the technical account:** in the AEM author instance → Tools → Cloud Services → Edge Delivery Services Configuration → your site's config → Properties → Authentication → copy the **technical account ID**, and grant it publish privileges.
4. **Point content at AEM:** edit `fstab.yaml` — replace the default content-source URL with your **AEM author instance** URL.
5. **Wire commerce:** copy the **sample** `config.json` (0c) into the repo root (swap to your backend later).
6. **Make PDPs resolve:** configure the (deprecated-but-functional) **folder mapping** so product URLs render client-side — no App Builder needed. *(The prerenderer is the durable build-time choice, not needed to transact — see [storefront-topology](./storefront-topology.md).)*

---

## Phase 2 — Run the test (the actual verification)
1. **Author a page** in **Universal Editor** on the AEM author instance; **Publish** (Preview destination).
2. Open the published site and walk the transaction: **product list** (Live Search/Catalog) → **PDP** → **add to cart** → **reach checkout**.
3. Confirm the **AEM-authored content** and the **commerce blocks** render together on the same page.

---

## Phase 3 — Record & decide
Record at each step (this feeds straight into the build plan):
- Which steps required **Adobe-org-side** actions → these are what the Content-SC's *own* extension must do in *their* org (confirms Scenario B's division of labor).
- Anything **manual/undocumented** → net-new extension work.
- How **PDP-URL routing** behaves out of the box (folder mapping vs. prerenderer default).
- *(Deferred to a second pass)* the **cross-org backend read AND transacting (cart/checkout *writes*), not just CORS** (your own backend, storefront in another org). CORS is verified as the browser-origin gate ([research](../../research/2026-06-04-cross-org-cors-and-mesh.md)); confirm end-to-end transacting live, since CORS is necessary, possibly not sufficient.
  - **Deciding sub-check (one request):** hit the **ACCS** core-commerce (cart/checkout) GraphQL with an `Origin` header and inspect the response for `Access-Control-Allow-Origin`. **Yes ⇒ no mesh needed for CORS even cross-org.** **No ⇒ a per-org mesh is required** (direct CORS config is PaaS-only — there is no ACCS knob). This decides whether the mesh is mandatory for Mode C.

**Outcome:**
- **Pass** → start the build at roadmap step 1 (shared upstream / AEM Sites content source), confident the spine holds.
- **Fail/flag** → bring it back; it'll localize to a specific step (auth, code-sync, fstab, folder mapping) with a known fallback.

---

## What desk research already confirmed (June 2026)

- **xcom is purpose-built** — "all the changes on top of `aem-boilerplate-commerce` to author content and commerce blocks in-context with Universal Editor."
- **AEM-as-content-source is standard** — Code Sync app + `fstab.yaml` → AEM author; content in AEM JCR, code in GitHub.
- **Sample backend exists** — the boilerplate transacts against a pre-configured commerce backend out of the box.
- **PDP routing needs *a* mechanism** (folder mapping — deprecated but works, client-side, transacts — or the App Builder prerenderer for SEO-grade HTML). Not a transaction blocker.
- Sources: [Set Up AEM Sites as a Content Source](https://www.aem.live/developer/ue-tutorial) · [Introduction to EDS in Cloud Manager](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/using-cloud-manager/edge-delivery-sites/introduction-to-edge-delivery-services) · [adobe-rnd/aem-boilerplate-xcom](https://github.com/adobe-rnd/aem-boilerplate-xcom) · [Storefront boilerplate configuration](https://experienceleague.adobe.com/developer/commerce/storefront/boilerplate/configuration/)

*(Confidence: provisioning specifics are from Adobe doc summaries — Adobe pages block direct fetch — so confirm exact clicks against the live ue-tutorial when you run it.)*
