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
>
> **No fork required (PM concern).** The copy pipeline *already* fetches canonical content
> from Adobe's **public CDN** (`.plain.html`, no auth) — it never reads the source org
> because it has no access to it. So the canonical B2B account page + sub-pages are
> publicly fetchable; what's missing is only the **list of paths to fetch**. The fix is a
> content-*discovery* change, not a content fork. See "Getting the canonical content (no
> fork)" below.

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
   sub-pages) to capture the real B2B sidebar `<ol><li>` + sub-page structure and **whether the
   menu is inline in that page or pulled from a separate fragment** (decides crawl-one-page vs
   follow-fragment).
4. **Does the canonical B2B site expose an index/sitemap that lists `/customer/*`?** Probe for a
   `sitemap.xml` and any query-index beyond `/full-index.json` that includes the account pages —
   this is what makes Approach **C** (zero hardcoded paths) viable vs falling back to B/A.
5. **Confirm the public-CDN read needs no auth** by fetching a canonical `.plain.html`
   unauthenticated (it should 200). This validates the whole "no fork / pull canonical" premise.
6. **Reproduce on a freshly created `b2b` project** and inspect the *authored* account page in
   DA.live (not just the rendered page) to confirm the missing `<li>` entries / stub.

## Scope — which package(s)

- **`b2b`** (`eds-paas`, `eds-accs`): **primary** — PM-confirmed report; HIGH confidence.
- **`citisignal-b2b`** (`eds-paas`, `eds-accs`): related second instance, fix in the same pass.
- The enumeration/auth-page logic lives in `daLiveContentOperations.ts` + `edsPipeline.ts`; the
  content/code sources live in `demo-packages.json`. The fix is **enumeration/discovery** there —
  no content fork. (`eds-demo-patches` `patches.json` would only be needed if we later choose to
  *transform* the pulled canonical account HTML, e.g. for branding; not required to fix the bug.)

## Getting the canonical content (no fork) — the key reframe

Hand-authoring the B2B account page into `eds-demo-patches` would be a **content fork** — the
exact maintenance burden ADR-006's thin-layer model exists to avoid. The good news from the code:
**we don't need to.** The copy pipeline already pulls canonical content from Adobe's **public
CDN**, so the only gap is *enumeration* (which paths), not *content* (what's on them):

- `copySingleFile` fetches the source with **no Authorization header** from
  `https://main--{site}--{org}.aem.live{path}.plain.html`
  (`daLiveContentOperations.ts:435,443,447` + `buildSourceUrl`). Auth is used **only** to write
  to the user's *own* destination org.
- The code says so explicitly: *"Can't use DA.live admin API for cross-org copies — no auth access
  to source"* (`:543-544`). Cross-org copy from canonical is **by design** a public-CDN read.
- Therefore Adobe's canonical `/customer/account.plain.html` **and the B2B sub-pages are already
  fetchable today** — the pipeline just never asks for them, because enumeration (list API → CDN
  index) never yields their paths.

So "get the canonical content" = **discover the canonical account paths, then let the existing
public-CDN copy pull them fresh.** Content stays 100% canonical and auto-updates when Adobe
changes it; we store no page HTML. Options, lightest-maintenance first:

- **C. Enumerate from a canonical index/sitemap that *does* list the account pages (best if it
  exists).** The current code reads `full-index.json`, which omits dropin pages. Check whether the
  canonical B2B site publishes another index (a dedicated query-index, or `sitemap.xml`) that
  includes `/customer/*`. If so, enumerate from it — zero hardcoded paths, fully canonical.
  *Needs probing (egress-blocked here) — see verification.*
- **B. Auto-discover sub-pages by crawling the canonical account page (most thin-layer if C
  fails).** Fetch canonical `/customer/account.plain.html`, parse the sidebar `<ol><li>` anchors
  to discover sub-page paths, then fetch each via the existing copy. The *only* thing we "know" is
  the entry path `/customer/account`; the menu and sub-pages come from canonical. Robust to Adobe
  adding/removing B2B sections.
- **A. Declared path list — config, *not* a content fork (pragmatic fallback).** Make the
  `essentialAuthPages` set package-aware and add the B2B account paths (company, purchase-orders,
  quotes, requisition-lists, quick-order). We'd maintain a short list of **path strings**; the
  HTML is still fetched live from canonical each create. Far lighter than forking content, but it
  does hardcode the path set, so it can drift if Adobe restructures.
- **D. List-API access (not recommended).** Add the demo user / a service identity to Adobe's
  `adobe-commerce` DA.live org so the list API enumerates everything. Smallest code, but an
  external access dependency Adobe controls — brittle and outside our gate. Avoid.

**Two things the plan must verify (they decide C vs B vs A):**
- Does `/customer/account.plain.html` on the canonical B2B CDN already contain the B2B sidebar
  `<ol><li>` **inline**, or is the menu sourced from a separate fragment? (Determines whether
  crawling one page is enough.)
- Why doesn't today's auth-page probe already grab `/customer/account`? It HEADs the **bare** path
  (`:1883`), not `.plain.html`; a dropin page may not 200 at the bare URL even though
  `.plain.html` exists. Switching the probe to `.plain.html` (or attempting the copy and treating
  404 as "stub") may already recover the main account page — the sub-pages still need B/C/A.

## Candidate fixes (for `/rptc:plan` — canonical-pull, no fork)

1. **Discover + pull the canonical B2B account set** via C (canonical index/sitemap) if one
   exists, else B (crawl the canonical account page's sidebar links), with A (small package-aware
   path list) as the fallback. All three keep content canonical — none stores page HTML.
2. **Fix the auth-page probe** to use `.plain.html` / copy-then-stub semantics, so the main
   account page is reliably pulled from canonical instead of silently stubbed.
3. **Keep the generic stub only as a last-resort fallback** (when canonical truly 404s), and make
   it B2B-aware enough not to actively *hide* features.
4. **Wire into reset too** (`edsResetRepoHelper`) so existing/stale storefronts self-heal on reset
   — same lesson as the 2026-06-12 dropin-delivery item.

Recommendation: **C if a canonical index/sitemap lists the account pages; otherwise B**, plus the
probe fix (2) and reset wiring (4). This pulls canonical content live, adds no fork, and degrades
gracefully. Use **A** only if discovery proves unreliable in practice. Confirm the canonical
structure during planning (verification below).

## Open question for the PM — RESOLVED

> Which package did the complaint come from? **Answered: `b2b` ("B2B Boilerplate").** Fix is
> scoped to `b2b` as primary; `citisignal-b2b` is included as the related second instance.

## Kickoff prompt (after verification)

> Root cause: the B2B customer account left-nav renders from authored `<ol><li>` content, but for
> the `b2b` package content enumeration falls back to the CDN `full-index.json` (the demo user
> isn't in Adobe's `adobe-commerce` DA.live org), which omits the dropin `/customer/account` page
> and its B2B sub-pages, and the auth-page backfill in `daLiveContentOperations.ts` only knows
> login/account/create-account — so the B2B account experience is never copied. The copy pipeline
> already pulls canonical content from the **public CDN** (`.plain.html`, no auth), so this is a
> discovery gap, **not** a content fork. Run `/rptc:plan` to **discover + pull the canonical B2B
> account set** — enumerate from a canonical index/sitemap if one lists `/customer/*`, else crawl
> the canonical `/customer/account.plain.html` sidebar links (small package-aware path list as a
> fallback) — fix the auth-page probe to use `.plain.html`/copy-then-stub, and wire it into
> `edsResetRepoHelper` so existing storefronts self-heal. Keep content canonical; store no page
> HTML. See `.rptc/research/b2b-account-features-missing/research.md`.
