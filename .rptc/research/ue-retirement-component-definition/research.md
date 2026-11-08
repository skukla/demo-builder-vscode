# Adobe retired Universal Editor from the Commerce templates: what it means for Demo Builder

Research, 2026-11-08 (owner asked after F67). Read with the walk plan's F67:
`.rptc/plans/beta-153-release-tests/overview.md`.

## What Adobe did, and why

Adobe's Commerce boilerplate removed its Universal Editor (UE) instrumentation in
[hlxsites/aem-boilerplate-commerce#1454](https://github.com/hlxsites/aem-boilerplate-commerce/pull/1454),
merged 2026-09-18. In Adobe's words: "Universal Editor in combination with Document Authoring is now
on a deprecation path — Experience Workspace is now the officially recommended default visual
editor for DA Live authors, and UE-with-DA is no longer supported for new projects." Customers who
want UE outside DA are pointed to `aem-boilerplate-xcom`.

What went: the root `component-definition.json`, `component-models.json`, `component-filters.json`;
the `blocks/*/_*.json` and `models/_*.json` partials; `scripts/ue.js` and `scripts/ue-utils.js`; the
`IS_UE` flag. What stays: DA.live's own live preview (`IS_DA`, `dapreview.js`).

Adobe's B2B template (`adobe-commerce/boilerplate-b2b-template`) took the same change later (its
commit 677106e0). An internal source agrees: UE with DA is deprecated in favour of Experience
Workspace, and Commerce is not onboarding new customers onto UE; UE continues for AEM-backed Edge
Delivery and headless projects. Not quoted here: this repository is public.

## Where our storefronts are today

| Storefronts | Template pointer | Has the UE files? |
|---|---|---|
| B2B packages (b2b, citisignal-b2b, bodea) | `b2b/last-known-good` held at f8eb94d (2026-11-08, F67) | yes |
| buildright-eds, isle5 | their own templates, not Adobe's boilerplate pointer | not checked |
| Root `last-known-good` | c937174, 2026-09-23 | yes |

Corrected the same day: the root pointer is not what non-B2B storefronts use. Every current package
names `b2b/last-known-good` or is built on its own template; the root pointer is read only for a patch
source that names no `lkgFile` (`lkgReader.ts:63`), which no current package does. It has not moved
since 2026-09-23 because no code ledger tracks it since 2026-10-17 (eds-demo-patches e6d86c7). Whether
anything still needs it is open (F68).

## What in Demo Builder depends on the UE files

Traced 2026-11-08; file:line from that day.

**`component-definition.json` is the source of the DA.live block library**, not only a UE file.
`createBlockLibraryFromTemplate` (`daLiveBlockLibraryOperations.ts:76-118`) reads it and turns each
`groups[].components[]` entry into a library block: its title, its id and its preview HTML
(`plugins.da.unsafeHTML`). From that come the doc pages, the `.da/library/blocks.json` sheet authors
pick from, and the site config's Blocks row. Used at creation, reset, refresh, Configure and import.

| Flow | Uses | When the file is absent |
|---|---|---|
| DA.live library sheet (create, reset, refresh, Configure, import) | reads it for the block list | returns success with 0 blocks: no sheet, no doc pages, no warning; an old sheet stays as it was |
| Block library install / update / reset | merges entries into all three files, records them (`addedEntries`) | copies the block folders, skips the merge, never creates the file; nothing recorded |
| Block library removal | takes recorded entries out | treats the entries as already gone |
| MCP `promote_block_to_library`, `remove_block_from_library`, `get_block_authoring_shape` | read and write it | throw "Could not read component-definition.json" |
| Template update | applies Adobe's diff (`git apply --3way`) | a deletion of a file the storefront changed stops the update with no option offered (`updateApplyTemplate.ts:76`: a failed apply carries no conflicts) |
| Site config (`da-live-classic`) | writes a UE editor URL (`daLiveSiteConfig.ts:33-54`) | not affected; Experience Workspace, the default, writes `da.live/canvas` |

What the record covers: `addedEntries` lists what each library install added, so those entries can
be found again. It misses blocks promoted through MCP, libraries installed before 2026-10-09, and
filled-in HTML examples.

## What this means

Moving to a template without the UE files breaks more than the update F67 saw:

1. **Updates** stop whenever a storefront's `component-definition.json` differs from the template's
   (any block library install, any promoted block).
2. **The DA.live block library goes empty** on a new project, a reset or a refresh, silently, because
   its block list comes from the deleted file.
3. **Block library installs** stop registering their blocks in the library.
4. **Three MCP block tools** fail outright.

The hold on the B2B pointer keeps all of this away from the B2B packages for now. The two packages on
their own templates are not affected by Adobe's pointer, but may carry the same files.

## Where Adobe now keeps the block library: in DA.live content, not code

Researched 2026-11-08 after the owner pointed out a block list comes from both the code and the
DA.live content.

- **The DA.live / Experience Workspace library is content only.** One document per block holding the
  block table, a `blocks` sheet (`name`, `path`), and a `library` tab in the site config pointing at it
  ([Set up the library](https://www.aem.live/docs/ew/administering/set-up-library.md)). It never reads
  `component-definition.json` or any code file.
- **Adobe's Commerce storefront content ships that library.** The source sites' public indexes list
  `/docs/library/blocks.json`, a page per block under `/docs/library/blocks/` and templates under
  `/docs/library/templates/` (checked: `https://main--boilerplate--adobe-commerce.aem.live/full-index.json`
  lists 14 library entries; the B2B site's index lists its own). The B2C sheet curates 10 blocks, the
  B2B one 7, out of 45 and 76 block folders in the code.
- **Adobe moved it there on purpose.** Commerce storefront release notes for 2026-10
  (`commerce-docs/microsite-commerce-storefront`, `src/content/docs/releases/2026-10.mdx`): Site Creator
  stores the library in `docs/library` instead of `.da/library`, and source sites must include
  `docs/**` in `full-index.json`. Internal guidance agrees: a new site gets the library by copying the
  source site's, with its own `library` config.
- **Demo Builder already copies it and then ignores it.** Content creation copies the source site's
  index (`edsPipeline.ts:676-703`), which now brings `/docs/library/**`; the copy keeps Adobe's paths
  (they point at Adobe's site), and nothing points the new site's `library` config at it. The palette
  is still built from `component-definition.json` (`daLiveBlockLibraryOperations.ts:76-118`). Reported
  by a research pass, not run live.

## Why Adobe's B2B library points at the non-B2B site

Checked 2026-11-08. The B2B site has its own example pages for exactly its 7 blocks
(`/docs/library/blocks/*` in its index), but its `blocks` sheet and its `templates` sheet point at the
non-B2B site (`content.da.live/adobe-commerce/boilerplate/...`). Its Cards page is byte-identical to
the non-B2B one, its Hero page differs (edited), and its `options` sheet names blocks neither site has
(marketo, chart, banner-image) with icons from another demo's content. Conclusion (inferred, with
internal confirmation): the B2B content was copied from the non-B2B site and the sheet trimmed by
hand, but its paths were never rewritten. Internal guidance records this as a known issue of sites
made by the Site Creator before a fix: the library sheet keeps `adobe-commerce/boilerplate` paths, and
the manual fix is to replace them with the site's own path. A copy artifact, not a design: an author in
a B2B site picking Hero gets the non-B2B example, not the edited B2B one. Demo Builder must rewrite the
copied sheet's paths to the new site whatever the source does.

## Which blocks: not only Adobe's

What a storefront can hold, and where each kind's library entry could come from:

| Block | Comes from | Library entry (block list row and example page) |
|---|---|---|
| Adobe's blocks | the template | Adobe's `/docs/library` content, copied at creation. Adobe curates the content blocks an author places (10 non-B2B, 7 B2B); the rest are page blocks (cart, checkout, account) that live on fixed pages |
| Block library with a content site (Demo Team, Bodea, Isle5) | its GitHub repo | its DA site's library pages (`contentSource` in `block-libraries.json`; copied today from `.da/library/blocks`, so `/docs/library` must be read too) |
| Block library with code only (BuildRight; a custom library from `demoBuilder.blockLibraries.custom`, a GitHub URL) | its GitHub repo | none of its own content: today its `component-definition.json`, if it has one; else a plain page per block |
| A block an agent promotes from a page | the storefront | the page it was promoted from |

## What `component-definition.json` gives custom blocks today, and what reading costs

Checked 2026-11-08 against the libraries' own repositories and content sites.

- **Mostly a name.** Each entry carries an id, a title and Universal Editor fields Demo Builder does
  not use. Sample markup (`plugins.da.unsafeHTML`), the only part that becomes an example page, is on
  few: Demo Team 2 of 53 blocks, Isle5 8 of 61, Bodea 4 of 80; BuildRight has no file at all.
- **Real examples come from the library's DA site.** Demo Team's site has a readable example page for
  12 of its 53 blocks (`.da/library/blocks/<id>`). Every other block gets a placeholder today: a block
  table holding only the block's title (`daLiveBlockDocPages.ts`, `generateStubDocPages`).
- **So the placeholder gap exists now** (about 39 of Demo Team's 53 blocks), and is not created by the
  change. Leaving `component-definition.json` loses only the names, which a block's folder name, or
  Adobe's README title, can supply.
- **No new permission.** Library example pages are read from the public preview site
  (`*.aem.page/.../<id>.plain.html`), which needs no sign-in (`copyBlockDocPagesFromSources`; checked:
  Demo Team's pages and Adobe's B2B Hero page answer 200 without credentials). Only the writes go to the
  SC's own storefront, with the DA.live sign-in creation already needs. A content site protected by
  site access would not be readable, and its blocks would fall back.

## Can every block be previewed? Measured 2026-11-08 (plan step 1)

Per block, in every library's code: an example page on its site, a real use on a page of its site, and,
opened in local headless Chromium, whether the block's own code finished (`data-block-status="loaded"`;
it proves the code ran, not that it shows something useful). Per-block results:
`block-previews-2026-11-08.csv` beside this file. Scripts were run from a scratch folder, not committed.

| Library | Blocks | Example page | Used on a page | Renders | No working preview (commerce-*) |
|---|---|---|---|---|---|
| Demo Team | 54 | 12 | 41 | 32 | 22 (11) |
| Isle5 | 52 | 0 | 17 | 14 | 38 (26) |
| Bodea | 103 | 28 | 35 | 0 | 103 (61) |
| BuildRight | 22 | site missing | site missing | could not measure | 22 |
| Adobe non-B2B | 45 | 8 | 36 | 16 | 29 (22) |
| Adobe B2B | 76 | 5 | 67 | 45 | 31 (23) |

Why the 238 have no working preview, and what each cause means:

- **Account, order and checkout blocks need a signed-in customer** (about 52 uses redirected to login,
  order search or cart). They work only on their own pages with a customer; Adobe leaves them out of its
  library. They are page blocks, not blocks an author places, and belong outside the palette.
- **Header and footer** render on every page; they are not authored as block tables.
- **Bodea's site has no Commerce config** (`config.json` 404), so every page, its 28 example pages
  included, shows the Commerce "Configuration Error". Measured on the library's own site; copied into an
  SC's storefront, the pages render with that storefront's config, so this is a measuring artefact to
  re-check in a real storefront, and Bodea's site config is ours to fix.
- **Product Details** shows the Configuration Error on `/products/default` (no product given); the same
  re-check in a real storefront applies.
- **No example and no use anywhere**: Demo Team 10 (embed, form, modal, quote, search, table, widget,
  and others), Isle5 35 (its site has no example pages and 39 pages), Bodea 50, Adobe 6 and 8
  (modal, targeted-block, widget, checkout-success pages). These are the real gap.
- **BuildRight has no content site**: 22 blocks with nothing to copy.
- **Broken code**: about 3 blocks; enrichment probably removes itself after merging (unconfirmed).
- Many real uses are empty block tables (Demo Team 21, B2B 47): those blocks need no authored content.

## The decision this needs

**Recommended: drive the block library from Adobe's content.** At creation, use the copied
`/docs/library/blocks.json` and its pages: rewrite their paths to the new site, write the `library`
config row, and add a row (and page) for each block library the SC picks, from that library's own
repository. Nothing for Demo Builder to maintain for Adobe's blocks, and `component-definition.json`
stops mattering. The code's `blocks/` folders serve only as a cross-check (a row whose code is missing,
a block with no example).

Open for the plan: whether Adobe's curated subset (10 and 7 blocks) is enough for demos, or the other
blocks in the code need a page too; the B2B sheet's paths point at the B2C site; existing storefronts
built from `component-definition.json` need the same library on their next reset or refresh.

Also needed either way: the template update must take Demo Builder's own entries out before applying a
deletion of `component-definition.json` (or keep the file), rather than stop; the B2B hold then lifts
and the rewritten SKU patch (eds-demo-patches 63c7d0f) goes back in.
