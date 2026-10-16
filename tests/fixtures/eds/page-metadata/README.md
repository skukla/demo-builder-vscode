# Page-metadata fixtures

Verbatim responses from public aem.live sites, captured with `curl` on 2026-10-16.
Nothing here is hand-written. Used by
`tests/features/eds/services/daLive/daLivePageMetadata.test.ts`.

| File | URL it came from |
|---|---|
| `b2b-customer-account.html` | `https://main--boilerplate-b2b--adobe-commerce.aem.live/customer/account` |
| `b2b-customer-account.plain.html` | same page, `.plain.html` |
| `b2b-checkout.html` | `https://main--boilerplate-b2b--adobe-commerce.aem.live/checkout` |
| `b2b-checkout.plain.html` | same page, `.plain.html` |
| `b2b-head.html` | `https://main--boilerplate-b2b--adobe-commerce.aem.live/head.html` |
| `b2b-metadata.json` | `https://main--boilerplate-b2b--adobe-commerce.aem.live/metadata.json` (an empty sheet) |
| `bodea-footer.html` | `https://main--bodea-source--skukla.aem.live/footer` |
| `bodea-footer.plain.html` | same page, `.plain.html` |
| `citisignal-product-adb261.html` | `https://main--accs-citisignal--demo-system-stores.aem.live/products/adobe-product-logo-socks/adb261` |
| `citisignal-product-adb261.plain.html` | same page, `.plain.html` |
| `citisignal-metadata-adb261-row.json` | `https://main--accs-citisignal--demo-system-stores.aem.live/metadata.json?offset=1&limit=1` (that page's sheet row) |

What each one shows:

- **customer/account, checkout**: page metadata the author wrote on the page
  (`template`, `robots`, `cache-control`, and a title no heading supplies). The
  site's sheet is empty, so none of it comes from the sheet.
- **bodea footer**: nothing authored. Its title is the first paragraph and its
  description the first paragraph of ten words or more, both of which Helix
  derives when the author wrote none.
- **citisignal product**: the sheet supplies title, description, `sku` and
  `last-modified` for this URL; `breadcrumb` is not in the sheet, so it was
  written on the page.

To refresh: re-run the same `curl` commands and check the tests still describe
what the live pages say.
