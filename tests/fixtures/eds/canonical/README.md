# Canonical EDS boilerplate fixtures (pinned)

These files are verbatim copies of the canonical
`hlxsites/aem-boilerplate-commerce` source, pinned to the **LKG SHA** the
extension already uses for storefront create/reset.

- **LKG SHA:** `760601940fa7264ea900c9d4b6bf735a5e78f46b`
- **Source of truth:** the `last-known-good` file in the external patches
  repo (`skukla/eds-demo-patches`), read at runtime by
  `src/features/eds/services/lkgReader.ts`.

## `aem-boilerplate-commerce-scripts.js`

Verbatim `scripts/scripts.js` from
`hlxsites/aem-boilerplate-commerce@760601940fa7264ea900c9d4b6bf735a5e78f46b`.

Used by `tests/unit/features/eds/services/quickEditAnchorMatch.test.ts` to
prove the two literal anchors `quickEditPublisher` search/replaces against
(`QUICK_EDIT_LOAD_PAGE_ANCHOR`, `QUICK_EDIT_BRANCH_ANCHOR`) still exist in
the pinned-canonical boilerplate. This anchor-match test is the safety net
that **replaces** the patches-repo LKG-gate's anchor coverage now that the
Quick Edit `scripts.js` edits live in the extension (not the per-brand
`code-patches.json` ledgers).

### Refreshing this fixture

Only refresh on a deliberate LKG bump. To re-pin:

```bash
LKG=$(curl -fsSL https://raw.githubusercontent.com/skukla/eds-demo-patches/main/last-known-good)
curl -fsSL "https://raw.githubusercontent.com/hlxsites/aem-boilerplate-commerce/${LKG}/scripts/scripts.js" \
  -o tests/fixtures/eds/canonical/aem-boilerplate-commerce-scripts.js
```

If the canonical `loadPage` signature or the post-`loadPage()` call-site
shape changes, the anchor-match test fails — that's the intended signal to
update the anchors in `quickEditPublisher.ts` in lockstep.
