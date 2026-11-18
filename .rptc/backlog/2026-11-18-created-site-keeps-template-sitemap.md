---
id: EDS-75
kind: fix
area: eds
needs: []
value: med
status: backlog
---

# A created storefront's sitemap is the template's, unchanged

Filed 2026-11-18 from the beta.153 walk (U3.1, finding F287).

## What happens

The content copy copies the template's `sitemap.json` spreadsheet as it is. Measured by public
GETs on 2026-11-18: `main--scratch-1028--skukla.aem.live/sitemap.json` is byte-for-byte
`main--boilerplate-b2b--adobe-commerce.aem.live/sitemap.json`: the same 131 paths (60 of them
`/fr/...` pages the demo never had) and image URLs pointing at the template's site.

## Why it matters

- Search engines and anything reading the sitemap see pages the demo does not have and images
  from another site.
- An import or share that falls back to the sender's page list (no `/query-index.json` or
  `/full-index.json`) reads the template's pages, which is what made F287's copy fail. F287 made
  missing pages a skip; the list itself is still wrong.

## Suggested fix

After the content copy, write the site's own sitemap from the pages actually copied (or let
Helix generate it from the site's index), never the template's. Check the reset path writes the
same. Open question to settle first: why the DA.live list API returned no files for the sender's
site on 2026-11-18 (it is what sent the copy to the fallback); not checked without a token.
