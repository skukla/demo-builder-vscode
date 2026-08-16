# Placeholder sheets: does anything need them, and should code fetch them at all?

**Filed:** 2026-08-15, from chasing nine console 404s on a freshly reset storefront.
**Severity:** cosmetic at most, and possibly ZERO. Filed as a design question, not
a defect — the evidence says the current code path may simply be unnecessary.
**Not urgent.** The logging fix (`edsResetRepoHelper`) already makes the current
state honest in the reset log, which was the actual harm.

## What was observed

A B2B storefront renders nine placeholder 404s per page load:

```
GET /placeholders/global.json  404
GET /placeholders/auth.json    404
GET /placeholders/pdp.json     404
... cart, wishlist, company, quick-order, requisition-list, recommendations
Failed to fetch placeholders from /placeholders/global.json: HTTP 404
No placeholder data found for path: placeholders/global.json
```

`/enrichment/enrichment.json` 404s the same way.

## Why (measured, three layers deep)

1. `edsResetRepoHelper.fetchPlaceholderFiles` fetches each sheet from the
   TEMPLATE'S LIVE SITE:
   `https://main--{templateRepo}--{templateOwner}.aem.live/{sheet}.json`
2. For B2B that resolves to
   `main--boilerplate-b2b-template--adobe-commerce.aem.live`, **which does not
   exist**. Measured: every sheet 404s, and so does `/config.json`, and so does
   `/`. It is a GitHub template repo that was never set up as an AEM site.
   Control: the same path on `main--aem-boilerplate-commerce--hlxsites.aem.live`
   returns **200**, so the mechanism is sound and only the host is wrong.
3. A full, successful reset (2026-08-15, commit `8107a42`) still left them
   absent — which DISPROVES the first theory, that the project simply had not
   been reset since the feature landed.

## What a sheet actually contains

Pure UI label dictionaries. No behaviour, no config, no data:

```json
{"Key":"Global.AddProductToCart",      "Value":"Add to Cart"}
{"Key":"Global.quantityLabel",         "Value":"Quantity"}
{"Key":"PDP.Product.OutOfStock.label", "Value":"Out of Stock"}
```

25 rows in `global`, 19 in `pdp`.

## So what is a build missing? Probably nothing

**A PDP rendered correctly, with correct labels, while all nine sheets 404'd**
(verified live in a browser, 2026-08-15). The dropins ship these English
defaults compiled in; the sheets exist to OVERRIDE them — for translation, or a
brand that wants "Add to Bag" instead of "Add to Cart". An English demo with
default wording needs none of it.

## The question worth answering before writing any code

**Placeholders are normally AUTHORED CONTENT** — DA.live spreadsheets, exactly
like `/redirects`, `/sitemap` and `/metadata`, which the same reset copies
successfully. `docs/architecture/eds-content-separation.md` describes committing
them as CODE files as a workaround for a DA.live limitation.

So a template wanting custom labels would naturally author them as content, and
the existing content-copy step would carry them with no code path involved.

That reframes this entirely: we may be maintaining a code-file fetch for
something the content pipeline already handles, aimed at a host that does not
exist, failing silently seventeen times per reset.

**Decide this first:**

1. Does ANY demo package actually need non-default UI labels? If no →
   the cleanup is DELETING `fetchPlaceholderFiles` and the
   `placeholderSheets` inventory, letting content own labels. If yes → the
   package should author them in DA.live like every other sheet.
2. Only if a code path must survive: source the sheets from
   `skukla/eds-demo-patches/<variant>/` rather than a live site. The extension
   already fetches `runtime-surfaces.json` from exactly that shape
   (`raw.githubusercontent.com/{owner}/{repo}/main/{path}/…`, `RuntimeSurfaceSource`),
   the variant directories already exist (`b2b`, `citisignal`, `custom`), and
   it inherits the LKG pinning the patches use. NOTE they cannot be *patches* —
   that schema (`{id, target, precondition, replacement, exit, critical}`)
   rewrites an existing file at an anchor and cannot create one.

## Could not establish

**Whether the B2B DA.live content source already HAS placeholder sheets that the
content copy is skipping.** `content.da.live/adobe-commerce/boilerplate-b2b/…`
returns 401 unauthenticated. If it does have them, this is a content-copy gap
rather than a code-fetch gap, and the fix is different again. Checkable from the
extension, which holds the DA.live bearer — do this before choosing an option.

## Already fixed, separately

The silence. Seventeen consecutive 404s produced ZERO log output, because only a
thrown error warned and a non-ok response was dropped. The reset log never
mentioned placeholders at all, so the gap surfaced only as browser console noise
days later. `fetchPlaceholderFiles` now counts outcomes and says, once:

> `[EdsReset] No placeholder sheets available from <host> (17 attempted). Dropin
> UI labels fall back to their built-in defaults; the storefront still renders.
> This is expected for a template with no published site.`

That line is the honest state of the world regardless of which option above wins.

## Pointers

- `edsResetRepoHelper.ts` `fetchPlaceholderFiles` (the fetch + the new counters)
- `runtimeSurfaceInventory.ts:76` `placeholderSheets` (the 17-sheet list)
- `runtimeSurfaceResolver.ts` (the `RuntimeSurfaceSource` fetch precedent)
- `docs/architecture/eds-content-separation.md` (why they are code files)
- ADR-008 (derive the runtime-surface inventory)
