# B2B account page shows no B2B features — research

**Filed:** 2026-06-18 · **Status:** RESEARCH — root cause identified (HIGH confidence). PM confirmed the report is the **`b2b` "B2B Boilerplate"** package. · **Priority:** HIGH — owner-facing demo defect

> **TL;DR.** The B2B *dropin delivery* problem was genuinely fixed on 2026-06-12 (the
> code layer loads the b2b dropins). But the customer **account page is driven by
> *authored content*, not code** — the left-nav menu is built from an authored
> `<ol><li>` list, and that authored content never reaches the destination. For the
> **`b2b` package**, content enumeration prefers the DA.live *list* API, which requires
> membership in the source DA.live org — but the source is **Adobe's `adobe-commerce`
> org**, which the demo user isn't in, so it **falls back to the CDN `full-index.json`**.
> That index **excludes the dropin-rendered `/customer/account` page and its B2B
> sub-pages**, and the auth-page backfill only knows `login`/`account`/`create-account`
> (not the B2B sub-pages or the sidebar source). So the account experience is never
> copied — at best a generic, B2B-unaware `commerce-account` stub lands. The b2b code
> loads, but there's nothing authored for it to surface — which is why "it doesn't show
> the B2B features" persists despite the earlier fix.

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

### Primary (HIGH confidence) — `b2b`: the B2B account content is never enumerated, so it's never copied

The `b2b` package ("B2B Boilerplate") sources **content** from Adobe's B2B content site
(`demo-packages.json` → `contentSource: { org: "adobe-commerce", site: "boilerplate-b2b" }`).
The copy pipeline enumerates source paths in `enumerateAndFilterContentPaths()`
(`daLiveContentOperations.ts:1755-1796`) with a **list-API-first, index-fallback** strategy:

1. **DA.live list API** (`getContentPathsFromDaLive` → `listDirectory`,
   `:1687-1718` / `:182-213`) calls `GET {DA_LIVE}/list/{org}/{site}/…` with the **user's IMS
   token**. This only returns content for orgs the **user is a member of**. The source org is
   **Adobe's `adobe-commerce`** — the demo user is **not** in it — so the list returns
   404→`[]`, and the code explicitly falls back (the `:1748-1749` comment: *"returns 404
   (mapped to empty array) for orgs the user doesn't belong to … also falls back when it
   succeeds but returns 0 paths"*).
2. **CDN index fallback** (`getContentPathsFromIndex`, `:1730-1742`) fetches
   `https://main--boilerplate-b2b--adobe-commerce.aem.live/full-index.json`
   (`edsPipeline.ts:254-258`). The query-index **excludes dropin-rendered customer pages and
   fragments** — the method's own doc (`:1679-1681`) says the index *"excludes fragment
   documents (nav, footer) and some spreadsheets that are not indexed."* `/customer/account`
   and the B2B account **sub-pages** (company management, purchase orders, quotes, requisition
   lists, quick order) are dropin pages → **not in the index → not enumerated.**
3. **Auth-page backfill is too narrow** (`:1872-1893`, stubs `:1948-1983`):

   ```js
   const essentialAuthPages = [
     { path: '/customer/login',          blockClass: 'commerce-login' },
     { path: '/customer/account',        blockClass: 'commerce-account' },
     { path: '/customer/create-account', blockClass: 'commerce-create-account' },
   ];
   // …if the page isn't on the source CDN, write a generic, B2B-unaware stub:
   `<div class="${blockClass}"><div><div></div></div></div>`
   ```

   It only knows three base auth pages — **not** the B2B account sub-pages, and **not** any
   account-sidebar source. `essentialFragments` is only `/nav` + `/footer`. So even the backfill
   can't recover the B2B account experience: at best `/customer/account` is copied alone (no
   sub-pages), and if the CDN doesn't serve it the destination gets a **bare `commerce-account`
   stub with no sidebar `<ol><li>` at all**.

Net: the B2B account nav items and sub-pages are never authored into the destination, so the
account page shows no B2B features — even though the B2B code/dropins load fine. **This is the
`b2b` package the PM confirmed in the report.**

### Related second instance (HIGH confidence) — `citisignal-b2b`: code is B2B, content is not

`citisignal-b2b` (both storefronts) pairs B2B **code** (`adobe-commerce/boilerplate-b2b-template`
git) with **content** from the **non-B2B** `demo-system-stores/accs-citisignal` site. Even
though that org *is* list-API-accessible (so enumeration succeeds), the CitiSignal source simply
has **no B2B account nav** to copy. Different trigger, same symptom — fix it in the same pass so
both b2b packages behave. (My initial read centered this package; the PM clarified the report is
`b2b`, but this one is broken too.)

## Could not verify here (verification steps for the plan)

Network egress to `*.aem.live` is blocked in this environment and the upstream B2B template repo
is outside the available GitHub scope, so confirm the following before/while planning:

1. **Confirm the list-API fallback fires for `b2b`.** On a real create, the log should show
   `[DA.live] List API returned 0 files, falling back to content index` (or *"List API
   unavailable…"*) for `adobe-commerce/boilerplate-b2b`. That proves enumeration is index-only.
2. **What does `full-index.json` contain for the B2B site?** Fetch
   `https://main--boilerplate-b2b--adobe-commerce.aem.live/full-index.json` and confirm
   `/customer/account` and the B2B account sub-pages are absent.
3. **What does the B2B content site actually author for the account experience?** Probe
   `https://main--boilerplate-b2b--adobe-commerce.aem.live/customer/account.plain.html` (and the
   sub-pages) to capture the real B2B sidebar `<ol><li>` + sub-page structure and how the sidebar
   sources its items (inline vs fragment) — this is the content the fix must reproduce.
4. **Reproduce on a freshly created `b2b` project** and inspect the *authored* account page in
   DA.live (not just the rendered page) to confirm the missing `<li>` entries / stub.

## Scope — which package(s)

- **`b2b`** (`eds-paas`, `eds-accs`): **primary** — PM-confirmed report; HIGH confidence.
- **`citisignal-b2b`** (`eds-paas`, `eds-accs`): related second instance, fix in the same pass.
- The enumeration/auth-page logic lives in `daLiveContentOperations.ts` + `edsPipeline.ts`; the
  content/code sources live in `demo-packages.json`. Any content-side authoring would land as a
  **content patch** in `eds-demo-patches` (`b2b/patches.json` / `citisignal-b2b/patches.json` —
  note both ledgers currently have only `code-patches.json`, no `patches.json`).

## Candidate fixes (for `/rptc:plan` — not yet decided)

The fix must get the B2B account page + sidebar `<ol><li>` + sub-pages authored into the
destination **without** relying on DA.live list-API access to Adobe's `adobe-commerce` org.

1. **Explicit, B2B-aware account-page set authored by the pipeline (recommended).** Don't depend
   on enumeration finding the dropin pages. Drive the account experience from a declared list:
   - **a. Package-declared auth pages + richer stubs.** Extend `essentialAuthPages`/stub
     generation to be package-aware (e.g. a `b2bAccount: true` flag or an explicit auth-page
     list in `demo-packages.json`). For b2b packages, author the full B2B sidebar `<ol><li>` and
     create the company/purchase-orders/quotes/requisition-lists/quick-order sub-pages with the
     right block markup. Non-b2b packages keep today's behavior. Self-contained in the extension;
     no cross-org content access needed.
   - **b. Ship the B2B account content as a content patch / content fixture in
     `eds-demo-patches`.** Add `b2b/patches.json` (and `citisignal-b2b/patches.json`) carrying
     the authored account page + sidebar + sub-pages, applied during content copy. Mirrors the
     existing content-patch mechanism and keeps the source-of-truth in the patch repo with the
     LKG/drift gate. Pairs well with (a) for the stub markup.
2. **If list-API access is the real intent, fix enumeration — but it can't be assumed.** Copying
   `/customer/account*` directly from the B2B DA.live source only works if the demo user has
   membership in `adobe-commerce` (they don't, by default). So treat 1a/1b as the robust path;
   don't design the fix around source-org access.
3. **Wire into reset too.** Whatever authors the account content must also run on the EDS reset
   path (`edsResetRepoHelper`) so existing/stale storefronts self-heal — same lesson as the
   2026-06-12 dropin-delivery item (stale storefronts didn't re-run the new step).

Recommendation: **1a + 1b + 3** — author an explicit B2B account page set (sidebar + sub-pages)
that the pipeline always creates for b2b packages, sourced from a content fixture in
`eds-demo-patches`, and re-run it on reset. Lock the exact authored structure against the live
B2B site during planning (verification steps 2–3).

## Open question for the PM — RESOLVED

> Which package did the complaint come from? **Answered: `b2b` ("B2B Boilerplate").** Fix is
> scoped to `b2b` as primary; `citisignal-b2b` is included as the related second instance.

## Kickoff prompt (after verification)

> Root cause: the B2B customer account left-nav renders from authored `<ol><li>` content, but
> for the `b2b` package content enumeration falls back to the CDN `full-index.json` (the demo
> user isn't in Adobe's `adobe-commerce` DA.live org), which omits the dropin `/customer/account`
> page and its B2B sub-pages, and the auth-page backfill in `daLiveContentOperations.ts` only
> knows login/account/create-account — so the B2B account experience is never authored. Run
> `/rptc:plan` to have the pipeline author an explicit B2B account page set (sidebar `<ol><li>` +
> company/purchase-orders/quotes/requisition-lists/quick-order sub-pages) for b2b packages —
> package-aware stubs in `daLiveContentOperations.ts` plus a content fixture in `eds-demo-patches`
> (`b2b/` + `citisignal-b2b/`) — and wire it into `edsResetRepoHelper` so existing storefronts
> self-heal. See `.rptc/research/b2b-account-features-missing/research.md`.
