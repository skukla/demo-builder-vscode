# Hybrid storefront model — one site, B2B *and* B2C by customer type

**Filed:** 2026-06-18 · **Status:** RESEARCH — feasibility (PM vision; assumption to verify). ·
**Relationship:** strategic frame for `content-copy-completeness` (the `/customer/nav` fix is Tier 1
of this).

> **PM vision:** rather than separate b2b vs non-b2b packages, make every package a **hybrid** —
> one storefront that serves a B2B experience to company customers and a B2C experience to
> individuals, decided at login. *"My assumption, which needs to be verified, is that the B2B
> boilerplate would allow for this in its content and code."*

## The assumption is well-supported at the account-nav layer (evidence in hand)

The `/customer/nav` fragment we pulled from the canonical B2B site is **permission-gated** — each
row carries a `permission` column:

| Menu item | permission |
|---|---|
| My account, Orders, Addresses, Returns | `all` |
| Requisition Lists, Company Profile, Company Structure, Company Users, Company Credit | `all` |
| Roles and Permissions | `Magento_Company::roles_view` |
| Purchase Orders | `Magento_PurchaseOrder::view_purchase_orders` |
| Approval Rules | `Magento_PurchaseOrderRule::view_approval_rules` |
| Quotes, Quote Templates, Seller Assisted Purchasing, Company Hierarchy | `all` / company-scoped |

This **is** the hybrid mechanism: the account dropin renders each item only if the logged-in
customer holds the permission / belongs to a company. So **the same site + same nav serves both
audiences** — an individual sees the B2C account; a company user sees the B2B features. The B2B
boilerplate is, by design, a superset that degrades to B2C. This is standard Adobe Commerce B2B
(company membership + ACL resources), confirmed here by the live nav content.

**→ Strong support for the vision at the frontend account layer.** What remains is verifying the
edges (below).

## Feasibility by dimension

| Dimension | State today | Hybrid-ready? |
|---|---|---|
| **Account nav / dropin** | B2B nav is permission-gated (evidence above) | ✅ Yes (verify the `all`-marked B2B rows actually hide for individuals — see risks) |
| **Frontend code base** | b2b packages use `adobe-commerce/boilerplate-b2b-template`; B2C packages use **other** bases (`hlxsites/aem-boilerplate-commerce`, and custom: `isle5`, `buildright-eds`, `citisignal-nextjs`) | ⚠️ Partial — needs consolidation onto the b2b base |
| **Branding/content overlay** | `citisignal-b2b` already brands the b2b base (commit `134e000`) | ✅ Proven possible |
| **Backend** | Builder configures PaaS/ACCS connection + catalog `Magento-Customer-Group` (pricing only — *not* B2B gating; the company concept was never a builder config) | ⚠️ **User prerequisite** — B2B enabled (Admin/CLI; module installed on PaaS; provisioned on SaaS) + companies + both customer types. **No public enable-API** (see API research). |
| **Demo data** | n/a | ⚠️ Needs **both** a company customer and an individual customer to show the switch |

Key distinction: the builder's `customerGroup` is a **Catalog Service pricing** header
(`Magento-Customer-Group`), recently *removed* from the UI/env (commits `083a226`, `a6be772`,
`10e9eec`). It is **not** the B2B company gating — that lives in the backend B2B module + ACLs and
is enforced by the dropins at runtime. Don't conflate them.

## What "every package hybrid" actually requires

1. **Consolidate frontends onto the b2b base.** Easiest for packages already on the canonical
   boilerplate (the EDS `citisignal` uses `hlxsites/aem-boilerplate-commerce` → swap to
   `boilerplate-b2b-template`, brand via overlay exactly like `citisignal-b2b`). **Custom** bases
   (`buildright-eds`, `isle5`, `citisignal-nextjs`) are not the canonical boilerplate and would
   need re-basing — a much larger, separate effort (likely out of scope).
2. **Backend B2B enablement.** The connected Commerce instance must have the B2B module on, with
   ≥1 company and ≥1 individual customer. This is a backend/demo-data prerequisite the builder
   doesn't currently manage — decide whether the builder should guide/verify it.
3. **Graceful B2C degradation.** Confirm a non-company customer on the b2b base sees a clean B2C
   account (no empty/broken B2B panels) and that B2B-only chrome (company switcher in header, etc.)
   hides cleanly.

## Verification plan (the PM's "needs to be verified")

Mostly live checks (egress-blocked here):
1. **Individual-customer UX on a b2b storefront:** log in as a non-company customer; confirm the
   B2B nav rows **hide** — *especially the `all`-marked B2B items* (Requisition Lists, Company
   Profile, Company Credit, Quotes): verify they don't erroneously show for individuals (the ACL
   may be coarser than the row implies). This is the single most important check.
2. **Company-customer UX:** log in as a company user; confirm the B2B sections render and function.
3. **B2C base parity:** confirm the b2b base, with no company, behaves like the B2C boilerplate for
   an individual (no regressions vs today's `citisignal`).
4. **Backend:** confirm the demo backends (PaaS/ACCS) can have B2B enabled + companies, and what
   setup that takes (is it builder-automatable or a manual backend step?).
5. **Header/global B2B chrome** (company switcher, quick order, request-quote on cart/PDP): confirm
   these also gate by customer type, not just the account nav.

## Backend B2B enablement — API research (2026-06-18) · PM assumption CONFIRMED

**Question:** can the builder programmatically flip B2B on (PaaS or SaaS/ACCS)? **Answer: no —
there is no public API to enable B2B; it's a backend prerequisite.** Evidence from Adobe docs:

- **B2B is "initially disabled"; a store admin enables it** in **Admin → Stores → Settings →
  Configuration → General → B2B Features** (`Enable Company = Yes` cascades Shared Catalog, B2B
  Quote, B2B payment/shipping; plus `Enable Quick Order`, `Enable Requisition List`, `Enable
  Purchase Orders`). Source: *Enable B2B features* / *General > B2B Features*.
- **Programmatic config is CLI, not a web API:** `bin/magento config:set` /
  `config:sensitive:set` (requires server/SSH access). There is **no generic public REST/GraphQL
  endpoint to set arbitrary store-config / feature flags**.
- **The B2B REST/GraphQL endpoints *operate* B2B, they don't *enable* it** — `company`,
  `negotiableQuote`, `purchaseOrder` manage data once B2B is on. (Adobe *Integrate with B2B using
  REST*.)
- **PaaS** additionally requires the **B2B module installed** (composer) before any of this.
- **SaaS/ACCS** is fully managed and "supports B2B and B2C from a single instance" (good for the
  hybrid vision), but enablement/availability is via Adobe's managed admin/provisioning — **no
  customer CLI, no documented public enable-API.**

**Implication (matches the PM):** treat **"backend is B2B-ready"** (B2B enabled + ≥1 company + ≥1
individual customer) as a **user prerequisite**. The builder should **not** try to flip it.
- *Optional, low-effort refinement — **reliable**, so include it (PM):* the builder can read-only
  **detect** B2B via the GraphQL **`storeConfig`** query, which exposes B2B feature flags
  (`is_requisition_list_active`, and negotiable-quote config). This is an **unauthenticated
  storefront-token query** — no admin auth, no logged-in customer. **Reliable for PaaS.** Design it
  **defensively**: warn only on a definitive negative (`is_requisition_list_active === false`);
  treat field-absent / query-unsupported (older schema, or ACCS variance) as *unknown → stay
  silent* (never false-alarm). On **ACCS/SaaS**, confirm the field exists; if not, degrade to the
  prerequisite doc only. This meets the reliability bar because it can only produce a true-negative
  warning, never a false positive.

## Scope decision (PM, 2026-06-18)

- **Hybrid reach = canonical-boilerplate packages only** (`b2b`, `citisignal-b2b`, and the EDS
  `citisignal` on `hlxsites/aem-boilerplate-commerce`). **Custom-base storefronts**
  (`buildright-eds`, `isle5`, `citisignal-nextjs`) are **out of scope** — not re-based here.
- **Backend B2B = user prerequisite**, not builder-managed (per the API research above).

## Recommendation — incremental, not big-bang

- **Tier 1 (now — already planned):** fix `/customer/nav` acquisition for the b2b-based packages
  (`b2b`, `citisignal-b2b`) via canonical pull + reference-following. This is the foundation of the
  hybrid model and is independently correct. (`content-copy-completeness` plan.)
- **Tier 2 (next, after verification 1–4):** make the b2b base the **default** for canonical-
  boilerplate packages (start with EDS `citisignal`): rebase to `boilerplate-b2b-template`, brand
  via overlay (proven by `citisignal-b2b`), pull the permission-gated account nav → that package
  becomes hybrid. Roll out package-by-package behind the verification.
- **Tier 3 (separate effort):** custom-base storefronts (`buildright`, `isle5`, headless) — re-base
  only if the demo value justifies it; not part of this thread.
- **Cross-cutting:** decide whether the builder should help enable/verify backend B2B + seed both
  customer types (a demo-data concern), so a hybrid frontend actually has something to show.

## Open questions for the PM

1. ~~Every package vs canonical-only?~~ **Resolved: canonical-boilerplate packages only**
   (`b2b`, `citisignal-b2b`, `citisignal` EDS); custom bases out.
2. ~~Builder-managed backend B2B?~~ **Resolved: user prerequisite** (no enable-API; see API
   research). Optional read-only readiness detection TBD.
3. ~~Prerequisite doc + detection?~~ **Resolved: yes — fold into the plan.** `storeConfig`
   detection is reliable (true-negative-only), so **include it** plus a B2B-ready checklist. Planned
   in `.rptc/plans/hybrid-storefront-model/step-01.md`.
4. **Still open (Tier 2 trigger):** proceed to rebase EDS `citisignal` onto the b2b base (branded
   overlay, like `citisignal-b2b`) once the live login-UX verification (checks 1–3) passes? Planned
   (gated) in `step-02.md`.

## Cross-refs

- `.rptc/research/b2b-account-features-missing/research.md` — the `/customer/nav` permission data.
- `.rptc/plans/content-copy-completeness/` — Tier 1 implementation.
- `.rptc/research/content-copy-completeness/research.md` — the bug class the Tier 1 fix closes.
