# Step 01 — Reference-following discovery in content copy (Layer 1) · ships the `/customer/nav` fix

**Goal:** After copying a page, discover the internal documents it references (fragments + internal
links) and copy them transitively, so `/customer/nav` — and unknown siblings — are pulled from
canonical without any hardcoded path. This is the user-visible fix *and* the structural fix.

## Why / root cause recap

`enumerateAndFilterContentPaths` yields index (or list-API) paths only; the account page references
`/customer/nav`, which is in neither the index nor `essentialFragments` (`/nav`,`/footer`). No code
follows references, so it's dropped → empty account menu. (See account-features research.)

## Test-first (RED)

New `tests/features/eds/services/daLiveContentOperations-referenceDiscovery.test.ts`, mirroring
`-content.test.ts` / `-enumeration.test.ts` (mock `fetch`):

1. `extractReferencedPaths(html, sourceBaseUrl)` returns internal doc paths from a `.plain.html`
   that embeds a fragment via `<a href="/customer/nav">` (relative) and absolute
   `<a href="https://main--site--org.aem.live/customer/nav">`; returns `/customer/nav` (extension-
   free, deduped) for both.
2. **Ignores** external hosts, anchors (`#`), mailto, `/products/*` overlays, media (`media_*`,
   `/icons/`), and the page's own path.
3. `copyContentFromSource` given a source whose `/customer/account` references `/customer/nav`
   copies **both** even though only `/customer/account` was enumerated (assert a POST to the dest
   `/customer/nav.html`). Use a fetch mock that serves `account.plain.html` (with the ref) and
   `nav.plain.html`.
4. Transitive + cycle-safe: a fragment that references another fragment is followed once; a
   self/loop reference does not recurse infinitely (visited-set).
5. Idempotent: a referenced path already in `contentPaths`/copied is not re-copied.

## Implement (GREEN)

In `daLiveContentOperations.ts`:

- Add `private extractReferencedPaths(html: string, sourceBaseUrl: string): string[]` — regex over
  `<a ... href="...">` (consistent with `transformHtmlForDaLive`'s regex approach). Keep only
  same-site internal paths; normalize to extension-free; drop anchors/media/products/icons/externals.
- Thread discovery into the copy loop in `copyContentFromSource` (`:1900-1945`): maintain a
  `visited: Set<string>` (seed with enumerated `contentPaths`) and a work queue. After a successful
  HTML copy, parse the **source** HTML for refs, enqueue unseen internal paths, copy them (reuse
  `copySingleFile`), cap depth (e.g. 3 — fragments are shallow), and dedup. Preserve batch/parallel
  behavior for the initial set; the discovered tail can copy in small batches.
  - Cleanest: capture the fetched source HTML inside `copySingleFile` so we don't double-fetch —
    either return the discovered refs from `copySingleFile`, or expose a thin
    `fetchSourcePlainHtml(path)` helper used by both copy and discovery. Avoid a second network round
    where possible.
- Discovered fragments flow through the **same** `processHtmlContent` (so content patches still
  apply) and the **same** dest-write path.

## Files

- `src/features/eds/services/daLiveContentOperations.ts` (discovery helper + copy-loop threading).
- New test file above.

## Acceptance

- Unit tests green; no double-fetch of the same source path.
- Live: a freshly created `b2b` project's DA.live site now contains `/customer/nav`, and the
  account page renders the full B2B menu (verify in browser per pre-work).
> **DECISION (PM, Option D):** the tactical `accountContentSource` override below is **NOT built in
> Tier 1**. citisignal-b2b's account chrome is folded into the **Tier 2** hybrid convergence (B2B
> base + brand overlay), where account-chrome-from-B2B becomes the default. Tier 1's generic
> discovery+audit still apply to citisignal-b2b without presuming B2B intent. The notes below are
> retained as the design rationale that moved to Tier 2 (`.rptc/plans/hybrid-storefront-model/`).

- **`citisignal-b2b` — intent established from history; inclusion is a PM scope call.** Intent is
  evidenced (not name-based): commit `134e000` ("Deliver a CitiSignal-branded EDS storefront **with
  B2B features**"), the package description enumerates account-based features (company/quotes/POs/
  requisition lists), tags include `b2b`, base is `boilerplate-b2b-template`. It shares the **exact**
  content source with the non-B2B `citisignal` package (`accs-citisignal`) and no content patch
  touches the account page, so discovery from that site yields **base nav only** — the account menu
  is genuinely missing. **But the reported complaint is `b2b`, not `citisignal-b2b`; whether to fix
  citisignal-b2b in this pass is a PM decision** (intent says yes; scope/priority is the PM's).
  - **If in scope** (no-fork fix): add a per-package `accountContentSource` override in
    `demo-packages.json` (`{ org: adobe-commerce, site: boilerplate-b2b }`), consumed by
    `copyContentFromSource` so the `/customer/*` auth pages + their referenced fragments come from
    the canonical B2B content site while the rest of the content stays CitiSignal. Still pulled live
    from the public CDN → no fork.
  - The `b2b` package needs **no** override (its `contentSource` already *is* `boilerplate-b2b`).
  - The generic Steps 01/03 (discovery + audit) apply to citisignal-b2b regardless — they
    faithfully reproduce whatever its source references **without presuming B2B intent**; only the
    `accountContentSource` override encodes the "should be B2B" decision, so it's the one piece
    gated on the PM call.

## Notes / risks

- Keep the ref regex narrow + fully tested; the Step 03 audit backstops misses.
- Don't follow `/products/*` (catalog overlays, already filtered) or external/CDN-asset links.
