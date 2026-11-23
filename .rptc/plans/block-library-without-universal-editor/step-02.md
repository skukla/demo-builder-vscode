# Steps 2 and 3: the block list comes from content and code, not `component-definition.json`

Design written 2026-11-23, after the owner's sign-off. Steps 2 and 3 share one change, the source of
the block list, so they are designed and built together.

## What was checked before designing (2026-11-23)

- Adobe's B2B source site `adobe-commerce/boilerplate-b2b` publishes `/docs/library/blocks.json`
  (7 rows: Hero, Accordion, Cards, Columns, Fragment, Metadata, Section-metadata, plus an `options`
  sheet) and `/docs/library/templates.json` (2 rows). Every row's path points at the non-B2B site
  (`content.da.live/adobe-commerce/boilerplate/...`), Adobe's copying mistake.
- The B2B site serves each of those pages itself: `/docs/library/blocks/<id>.plain.html` and
  `/docs/library/templates/<id>.plain.html` all answer 200 on `main--boilerplate-b2b--adobe-commerce.aem.page`.
- `.da/library/blocks.json` answers 404 there (Adobe's 2026-10 move to `/docs/library`).
- Real storefronts Demo Builder made (`scratch-1028`, `patch-canary-b2b`, starter package) serve
  `/docs/library/blocks/hero` but not `/docs/library/blocks.json`: the copy brings the pages, not a
  usable sheet. A Bodea storefront (`my-commerce-demo`) has neither, because Bodea copies its content
  from `skukla/bodea-source` and takes only account pages from Adobe's B2B site.
- So the copied storefront cannot be the source of Adobe's list. Adobe's source site can.
- Which packages reach Adobe's B2B site: starter (its content source), CitiSignal and Bodea (their
  account content source). Isle5 and BuildRight use their own templates and sites.

## What it is in the model

Nothing new is stored. The block list is computed each time the library is built, from three things
the storefront already has:

1. **Adobe's blocks**: the rows of `/docs/library/blocks.json` on the package's Adobe source site
   (the content source or account content source that is `adobe-commerce/boilerplate-b2b`). A row's
   block id is the last segment of its path; its title is the row's `name`. The example page is read
   from that same source site at `/docs/library/blocks/<id>`, never from the path the row names.
2. **Every other block the storefront has**: every `blocks/<id>/` folder in the storefront's
   repository, none left out. This covers the template's blocks Adobe does not list (Carousel,
   Product Recommendations, the Commerce page blocks), block library blocks, de-duplicated ones, and
   blocks an agent made, in one rule, because it reads what code the storefront actually has. Title:
   the folder name in title case.
3. **Order**: Adobe's blocks first, in Adobe's order; then the other blocks A to Z, with every
   `commerce-*` block after them, so the Commerce page blocks sit together at the end.
4. Child components (`accordion-item`, `columns-cell` and the like) were Universal Editor entries,
   not blocks, and leave the palette.

**Where a block's example comes from (the convention).** The first of these that exists, never an
invented sample:

1. Adobe's example page for it (`/docs/library/blocks/<id>` on the Adobe source site).
2. Its block library's example page (the library's content site, `/docs/library/blocks/<id>`, then
   `/.da/library/blocks/<id>`).
3. **Its real use**: the block's table copied from a page that uses it, settings rows included,
   looked for first on the block's library site (for a library block), then on the storefront's
   content source. This covers custom blocks: a library block is used on its library's site, not on
   Adobe's (owner, 2026-11-23: the convention covers custom blocks). BuildRight and Demo Builder
   Blocks have no site, so their blocks skip rule 2 and the first half of rule 3.
4. A placeholder shaped like the block's code expects (rows and columns of "Column N content"), as
   DA.live's own Import Blocks builds it (`adobe/da-live` `blocks/config/blocks-import/blocks.js`
   `blockDoc`, added 2026-11-23, Apache-2.0). Owner, 2026-11-23: Adobe's placeholder over the
   "No example yet" page. Examples are kept per style variant, as Import Blocks does, and the page,
   names and list rows match its output so an SC can re-run Import Blocks over ours.

A storefront's existing example page is kept over all four (an agent or the SC may have written it).
DA.live will not do this for us: its source POST ignores any `overwrite` field and always writes,
keeping the old content as a version (adobe/da-admin `src/storage/object/put.js`, read 2026-11-23).
So the build's own existence check is the only protection, and it fails safe: only a definite 404
means "no page"; a check that fails any other way (429, 5xx, timeout) counts as a page and keeps it.

The exception is a page Demo Builder provably generated, which counts as no page so the convention
picks a real example and the build replaces it (owner rule: replace only what Demo Builder provably
wrote; `blockLibrary/oldStubPages.ts`). Exactly two kinds:
- **The old stub** (`generateStubDocPages`): one block table classed by the id, one row, one cell,
  one paragraph of plain text, AND that text is exactly the block's title, meaning its blocks-sheet
  row `name` or `displayName(id)`. The old builder wrote the same title in both places. The shape
  alone is no proof: a promoted page with one plain-text cell has the same envelope.
- **An untouched placeholder**: exactly what `blockDoc` writes with no example (one section per
  variant, every cell `<p>Column N content</p>` in column order), as Import Blocks also writes it.

Any other page, including a stub or placeholder with any cell edited, is kept.

Owner decisions, 2026-11-23: list Adobe's 7 plus the rest, over Adobe's curation alone; then list
every block, no exclusions ("an author can put these blocks anywhere"), with the Commerce blocks
grouped at the end; then the real-use example, after the checkout case below.

### Verified 2026-11-23

- **The Commerce placeholders are wrong to place.** On Adobe's B2B site the checkout page's block is an
  empty table and the cart's carries settings rows ("Enable Item Quantity Update: true", ...). Today's
  placeholder on `scratch-1028` puts the words "Commerce Checkout" in the checkout table and drops the
  cart's settings. An author placing them from the palette got the wrong table.
- **Real uses cover most blocks.** Of the 76 block folders in the template at f8eb94d, 67 are used on
  a page of `adobe-commerce/boilerplate-b2b` (92 pages, from its `full-index.json`; pages whose path
  ends in `/` are read at `<path>index.plain.html`). The 9 with no use: `carousel`, `targeted-block`
  (content blocks nobody placed there; they fall to rule 4 or another site), `header`, `footer`,
  `modal`, `widget` (loaded by code), `commerce-checkout-success`, `commerce-b2b-po-checkout-success`,
  `commerce-company-accept-invitation` (shown by other blocks' code, not authored on a page).
- **Adobe's per-block definition files are gone too.** At f8eb94d several blocks carried
  `_<id>.json` (title, fields); at Adobe's latest they do not. Each block keeps a `README.md`.
- **The palette keeps the sheet's order and does not sort** (DA.live's source, `adobe/da-live`
  `blocks/edit/da-library/helpers/index.js` `getBlocks`: rows pushed in sheet order; no `sort` in
  `da-library.js`, against 3 `loadItems` mentions as the control). It has a search box.
- **Only rows titled "Blocks" and "Templates" render as lists** (`helpers.js` `fetchLibraryConfig`:
  `name === 'blocks'` gets `getBlocks`, `name === 'templates'` gets `getItems`; any other title is a
  plugin). That is why the older grouped lists showed blank, and it confirms the Templates row.
- **One entry can hold several examples.** `groupBlocks`/`transformBlock` name each example in a block
  page by the heading before it, and read a `library-metadata` table's `searchtags` and
  `description`. Not used in this step; noted for step 4.

Where it lives (as built): `src/features/eds/services/blockLibrary/`. `storefrontBlockList.ts` is a
pure function returning each block with one chosen example (`existing | adobe | library | real-use |
placeholder`); `storefrontBlockLibrary.ts` gathers its inputs; `storefrontLibraryWriter.ts` writes the
pages, the sheet and the site setting. The old `createBlockLibrary` is deleted.

Files stay where they are: the sheet at `/.da/library/blocks.json`, pages at `/.da/library/blocks/<id>`.
No storefront has to move anything, and the remove, append and publish code that matches these paths
keeps working.

## Templates

A second site-setting row, **Templates**, pointing at `/.da/library/templates.json`, built the same
way from Adobe's `templates.json` (rows `key`, `value`), with each template page copied from the
Adobe source site's `/docs/library/templates/<id>` to `/.da/library/templates/<id>`. A package with no
Adobe source gets no Templates row. A template page already there is kept, not copied again (same
fail-safe check as block pages), and the sheet keeps every row it has, with its other columns,
adding ours by path or title. When the sheet cannot be read, no template is written.

The blocks sheet likewise keeps a row that matches one of ours as it is: its own `name` (an agent's
promote title or the SC's) and every column; only a missing column is filled. This departs from
Import Blocks' `mergeBlockRows`, which overwrites the name, on purpose (a user's own edits are never
overwritten).

The site setting's `library` sheet is replaced whole on each write (`updateSiteConfig`), so Blocks and
Templates are written in one call, with `keepOtherRows` so a row the SC added (a plugin, another
list) survives; the one-row re-register used when an agent adds a block
(`registerBlocksLibrarySection`) keeps any other row it finds too.

## Callers

`createBlockLibraryFromTemplate` is replaced by one entry point taking the storefront repository, the
package's Adobe source, and the libraries' content sites. Both
callers move to it: the storefront pipeline (creation, reset, Refresh Blocks, Configure) and
`ensureEdsContent`. The "read the user's repo or the template's" switch (`edsPipeline.ts:520`) goes
away: the list always comes from the storefront's code plus Adobe's content.

## Refresh Blocks

Refresh Blocks (dashboard, command, agent tool) stays the one door that rebuilds the list, now through
this design. No button mirrors DA.live's Import Blocks (owner, 2026-11-23: one action, one door). Its
hover text becomes "Rebuild the DA.live block list from the storefront's code and pages".

## Other shapes considered

- **Rewrite the copied `/docs/library/blocks.json` in the storefront and register it.** Turned down:
  real storefronts do not carry the sheet, and Bodea's carry no Adobe pages at all.
- **Move everything to `/docs/library` like Adobe.** Turned down for now: every existing storefront's
  pages and the code matching `.da/library` paths would have to move, for no change the SC sees.
- **Keep reading `component-definition.json` where a template still has it** (Isle5, BuildRight).
  Turned down: the storefront's block folders already list those blocks, and keeping the file as a
  source is what this plan removes.

## Tests

Unit: `storefrontBlockList` over fakes (Adobe rows, the mistaken paths ignored, folder diff, existing
page wins, library site tried before placeholder, no Adobe source). Writer: per-block sources, the
Templates row written with Blocks in one call, re-register keeps Templates. Contract: Adobe's sheet as
fetched on 2026-11-23, saved as a fixture with where it came from. Every caller's suite moves with the
new entry point; `spine-chokepoints` pins it as the one door.
