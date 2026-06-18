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
- **`citisignal-b2b` caveat:** its source (`accs-citisignal`) is non-B2B — discovery will copy
  whatever nav it references, which may *not* contain B2B items. Record the live result; if so,
  citisignal-b2b needs its account page/nav sourced from the B2B site or a content patch — capture
  as a follow-on (do not silently mark fixed).

## Notes / risks

- Keep the ref regex narrow + fully tested; the Step 03 audit backstops misses.
- Don't follow `/products/*` (catalog overlays, already filtered) or external/CDN-asset links.
