# B2B account page shows no B2B features — research

**Filed:** 2026-06-18 · **Status:** RESEARCH — root cause identified (HIGH confidence for `citisignal-b2b`; one branch needs live verification) · **Priority:** HIGH — owner-facing demo defect

> **TL;DR.** The B2B *dropin delivery* problem was genuinely fixed on 2026-06-12 (the
> code layer loads the b2b dropins). But the customer **account page is driven by
> *authored content*, not code** — the left-nav menu is built from an authored
> `<ol><li>` list. The `citisignal-b2b` package sources that content from the
> **non-B2B CitiSignal content site** (`demo-system-stores/accs-citisignal`), which has
> no B2B account-nav entries, and the auth-page fallback stubs a generic
> `commerce-account` block with no B2B nav. So the b2b code is present and loads, but
> there is nothing authored to make the account page *show* Company Management, Quotes,
> Purchase Orders, Requisition Lists, etc. That is why "it doesn't show the B2B
> features" persists despite the earlier fix.

---

## Provenance

User report: "the B2B boilerplate demo template's customer account page doesn't show the
B2B features — I could've sworn this was addressed." This research traces (a) what was
actually addressed in history and (b) why the account page still shows no B2B features.

## What history *did* address (so the memory is correct)

Searched both repos (`demo-builder-vscode@master`, `eds-demo-patches@main`).

- **`2026-06-12` — "B2B feature pack: dropins never reach the browser"** (`.rptc/complete/2026-06-12-b2b-feature-pack-dropin-delivery.md`). Resolved by the *opposite* of the original additive design:
  - `134e0003` `feat(demo-packages): add citisignal-b2b package` — brand the coherent `boilerplate-b2b-template` base.
  - `49b3d6d1` `refactor: remove the feature-pack mechanism` (−1552 lines).
  - Patch ledger `eds-demo-patches@citisignal-b2b` (`2c78fd9`). Merged via `8d48c17f`.
  - **Validated then:** `preact-vendor.js` 200, all 6 b2b dropins + import map present, b2b features "work." That validation was about the **code/runtime layer** (dropins load), not about the account page's **authored content**.
- **`commerce-account-sidebar-selector-race`** code patch (in `eds-demo-patches/{b2b,citisignal-b2b,custom}/code-patches.json`, added `2174e9a` / `2c78fd9`). Fixes an *empty* sidebar caused by a decoration-timing selector race — i.e. it makes an **already-authored** `<ol><li>` render reliably. It does **not** add any B2B menu items; if the authored content has no B2B entries, this patch has nothing to surface.

So: the dropin-delivery fix and the sidebar-race fix were both real. Neither one authors
B2B menu items onto the account page. That is the gap.

## How the customer account page actually renders its features

The account left-nav (`blocks/commerce-account-sidebar/commerce-account-sidebar.js`) builds
its menu from **authored content**, not code. The race-fix patch shows the contract verbatim:

```js
// matches the authored structure
fragment.querySelectorAll('main > div > ol > li, .default-content-wrapper > ol > li')
```

Each `<li>` in the authored account page is one sidebar entry (My Account, Orders, …, and in
B2B: Company Profile, Company Users, Purchase Orders, Quotes, Requisition Lists). **No
authored `<li>`, no menu item — regardless of which dropins the code layer loaded.** The b2b
feature dropins only render *inside* a page you can navigate to; if the nav never lists them
and the sub-pages aren't authored, the features are invisible.

## Root cause

### Primary (HIGH confidence) — `citisignal-b2b`: code is B2B, content is not

`src/features/project-creation/config/demo-packages.json` (`citisignal-b2b`, both `eds-paas`
and `eds-accs` storefronts):

| Layer | Source | B2B? |
|---|---|---|
| **Code** | `adobe-commerce/boilerplate-b2b-template` (git) | ✅ has b2b dropins, initializers, `commerce-account-sidebar` block |
| **Content** | `demo-system-stores/accs-citisignal` (`contentSource`) | ❌ non-B2B CitiSignal telco content |

Content is copied from the **non-B2B CitiSignal site**, whose `/customer/account` page (if it
exists there at all) has only the base account nav. So the destination account page is
authored with **no B2B menu items** → no B2B features show. The b2b code loads fine; there is
simply nothing authored for it to surface. This is the package most likely behind the report.

### Contributing (affects both b2b packages) — the auth-page fallback is not B2B-aware

`daLiveContentOperations.ts` `copyContentFromSource()` handles customer auth pages
(`src/features/eds/services/daLiveContentOperations.ts:1872-1893`, stubs `:1948-1983`):

```js
const essentialAuthPages = [
  { path: '/customer/login',          blockClass: 'commerce-login' },
  { path: '/customer/account',        blockClass: 'commerce-account' },
  { path: '/customer/create-account', blockClass: 'commerce-create-account' },
];
// …if the page isn't on the source CDN, write a generic stub:
`<div class="${blockClass}"><div><div></div></div></div>`
```

Two B2B blind spots here:
1. **The stub has no sidebar and no B2B awareness.** When `/customer/account` isn't on the
   source, the destination gets a bare `commerce-account` block — zero nav entries.
2. **The B2B account *sub-pages* and the sidebar source are never enumerated.** The probe list
   is only login/account/create-account, and `essentialFragments` is only `/nav` and
   `/footer`. The B2B account experience also needs authored pages/fragments for company
   management, purchase orders, quotes, requisition lists, and quick order. If those aren't in
   the source content index, nothing copies them.

### Secondary (MEDIUM confidence — needs live verification) — standalone `b2b`

The `b2b` package ("B2B Boilerplate") sources content from the B2B content site
(`adobe-commerce/boilerplate-b2b-template`, site `boilerplate-b2b`), so its account page
*should* carry the B2B nav **iff** that site's `/customer/account` (plus its sidebar
source and the b2b sub-pages) are enumerated/probed and copied. Given the auth-page handling
above only guarantees `/customer/account` itself (and only if it's reachable on the CDN), the
b2b sub-pages and any sidebar fragment named other than `/nav` could still be dropped. Whether
standalone `b2b` is actually broken depends on the B2B source site's authored structure, which
I could not verify from this environment (see "Could not verify").

## Could not verify here (verification steps for the plan)

Network egress to `*.aem.live` is blocked in this environment and the upstream B2B template
repo is outside the available GitHub scope, so the following must be confirmed before/while
planning the fix:

1. **Does `demo-system-stores/accs-citisignal` have a `/customer/account` page, and what nav
   items does it author?** (Expected: base only, no B2B.) Probe
   `https://main--accs-citisignal--demo-system-stores.aem.live/customer/account.plain.html`.
2. **What does the B2B content site author for the account experience?** Probe
   `https://main--boilerplate-b2b--adobe-commerce.aem.live/customer/account.plain.html` and look
   for the B2B `<ol><li>` entries + linked sub-pages (company, purchase-orders, quotes,
   requisition-lists, quick-order) and how the sidebar sources its items (inline vs fragment).
3. **Reproduce on a freshly created project of each package** and inspect the *authored*
   account page in DA.live (not just the rendered page) to confirm the missing `<li>` entries.

## Scope — which package(s)

- **`citisignal-b2b`** (`eds-paas`, `eds-accs`): primary, HIGH confidence.
- **`b2b`** (`eds-paas`, `eds-accs`): verify; may share the contributing gap.
- The content/code-source mismatch lives in `demo-packages.json`; the auth-page handling lives
  in `daLiveContentOperations.ts`. Any content-side authoring would land as a **content patch**
  in `eds-demo-patches` (`citisignal-b2b/patches.json` — note: that ledger currently has only
  `code-patches.json`, no `patches.json`).

## Candidate fixes (for `/rptc:plan` — not yet decided)

1. **B2B-aware account content (recommended direction).** Author the B2B account page +
   sidebar `<ol><li>` (and the b2b sub-pages) into the destination for b2b packages. Two ways:
   - **a. Source from the B2B content site:** for b2b packages, copy `/customer/account*` (and
     the sidebar fragment) from `adobe-commerce/boilerplate-b2b-template` content instead of
     stubbing / instead of taking them from the CitiSignal source. Most faithful to upstream.
   - **b. Content patch + richer stub:** add a `citisignal-b2b/patches.json` content patch (and
     a B2B variant of the auth-page stub) that injects the full B2B sidebar `<ol><li>` and
     creates the b2b sub-pages. Mirrors the existing content-patch mechanism; keeps CitiSignal
     branding on the rest of the site.
2. **Make `essentialAuthPages`/stubs package-aware.** Drive the auth-page list and stub markup
   from the package definition (e.g. a `b2bAccount: true` flag or an explicit auth-page list in
   `demo-packages.json`) so b2b packages enumerate + author the company/PO/quote/requisition/
   quick-order pages and a B2B sidebar, while non-b2b packages keep today's behavior.
3. **Wire into reset too.** Whatever authors the account content must also run on the EDS reset
   path (`edsResetRepoHelper`) so existing/stale storefronts self-heal — same lesson as the
   dropin-delivery item (stale storefronts didn't re-run feature packs).

Recommendation: **1a or 1b + 2 + 3.** 1a is the least bespoke if the B2B content site authors a
clean, copyable account experience (verify step 2 above); fall back to 1b if the CitiSignal
branding must be preserved on the account chrome. Decide during planning once the two content
sites are probed.

## Open question for the PM (changes fix scope)

Which package did the complaint come from — **CitiSignal B2B** (`citisignal-b2b`) or the plain
**B2B Boilerplate** (`b2b`)? The wording "B2B boilerplate demo template" matches `b2b`, but the
clear defect is in `citisignal-b2b`. The answer determines whether the fix is content-source/
content-patch work on `citisignal-b2b` only, or also the broader package-aware auth-page change.

## Kickoff prompt (after verification + PM answer)

> Root cause: the b2b customer account page renders its left-nav from authored `<ol><li>`
> content, but `citisignal-b2b` sources content from the non-B2B `accs-citisignal` site and the
> auth-page fallback in `daLiveContentOperations.ts` stubs a B2B-unaware `commerce-account`
> block, so no B2B menu items are ever authored. Run `/rptc:plan` to author the B2B account
> page + sidebar (+ sub-pages) for b2b packages — either by sourcing `/customer/account*` from
> the B2B content site or via a `citisignal-b2b/patches.json` content patch plus a B2B-aware
> auth-page stub in `daLiveContentOperations.ts` — and wire it into `edsResetRepoHelper` so
> existing storefronts self-heal. See `.rptc/research/b2b-account-features-missing/research.md`.
