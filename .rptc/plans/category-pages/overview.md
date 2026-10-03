# EDS-24 — category pages and a catalog menu from the Commerce tree

Item: `.rptc/backlog/2026-10-01-category-pages-and-nav-from-the-commerce-tree.md`.
Built 2026-10-03 (unattended loop, branch `loop/2026-10-03-night2-a`), up to the edge
of anything that touches GitHub, DA.live or Commerce.

## What an SC gets once this plan is finished

They tick **Demo Builder Blocks** in the Storefront area (or run the action on an
existing project). Demo Builder then writes one page per Commerce category (the
boilerplate's `/apparel` recipe), adds a "Shop the catalog" line and a `catalog-menu`
block to the nav, and the header shows the Commerce tree as menus. Hand-typed nav
items stay. The SC can type `Shop the catalog: Safety Signs` to place one category
anywhere in the menu. Undo removes the pages Demo Builder wrote and the switch.

## What exists now

| Part | Where | State |
|---|---|---|
| `catalog-menu` block | `../demo-builder-block-library/` (local git repo, branch `main`, no remote, nothing committed) | built, 15 node tests (`npm test`), airbnb lint clean |
| Category page HTML + plan | `src/features/eds/services/catalogMenu/categoryPages.ts` | built, tested |
| Nav switch add / remove | `src/features/eds/services/catalogMenu/navSwitch.ts` | built, tested |
| Write pages + switch, undo | `src/features/eds/services/catalogMenu/catalogMenuService.ts` | built, tested with an in-memory DA.live site; **no caller yet** |
| `block-libraries.json` entry | — | **not added**, see step 3 |
| Human surface, agent tool | — | not built, see step 6 |

## The owner's steps, in order

### 1. Create the GitHub repository

Decide: name and visibility. Recommendation: `skukla/demo-builder-block-library`,
**public**. The installer reads the source repo through the SC's GitHub session
(`githubFileOps.listRepoFiles` on `lib.source`), so a private repo would fail for every
SC who cannot read it — and, per step 3, take the other selected libraries down with
it. Nothing in the repo is secret (property 4 still applies: check before pushing).

### 2. Push the local library

```
cd ../demo-builder-block-library
git add -A && git commit -m "feat: catalog-menu block"
git remote add origin git@github.com:skukla/demo-builder-block-library.git
git push -u origin main
```

`node_modules/` is ignored. `test/` and `package.json` live outside `blocks/`, so the
installer never copies them into a storefront (it copies `blocks/<id>/**` only,
`blockCollectionHelpers.ts`).

### 3. Add the catalog entry (only after step 2)

Why it was not added tonight: a library whose repository does not exist **breaks every
library install it is selected with**. `listRepoFiles` answers a 404 with `[]`, but
`getBranchInfo` throws on it (`githubFileOperations.ts`), and `installBlockCollections`
wraps the whole run in one try — so an SC who ticked it would lose the Demo Team
blocks too, not just this one.

Entry to add to `src/features/components/config/block-libraries.json` (schema and
`BlockLibrary` type need no change — every field already exists):

```json
{
  "id": "demo-builder-blocks",
  "name": "Demo Builder Blocks",
  "description": "Optional blocks from Demo Builder: a nav menu built from the Commerce category tree",
  "type": "standalone",
  "source": { "owner": "skukla", "repo": "demo-builder-block-library", "branch": "main" },
  "stackTypes": ["eds-storefront"]
}
```

Decide: offered to every package (no `onlyForPackages`, as above) and default-on for
none — or `defaultForPackages` for the packages that load a catalog. Recommendation:
off by default until the first real run (step 5) has passed. Pins that move:
`tests/features/components/services/blockLibraryLoader.test.ts` asserts exact available
lists (`toEqual(['demo-team-blocks'])`, `toHaveLength(1)`) for several packages — those
assertions are right to fail and must be updated with the new id. No `contentSource`
yet: the DA.live library doc page for the block is a follow-up.

### 4. The live B2B read (the item's "prove before building")

Not run tonight: no Demo Builder window was answering the probe socket (`mcp-live-probe
info` → `ECONNREFUSED`). Run it with the Justrite project open, through the read tool:

```
node .claude/skills/mcp-live-probe/probe.mjs call run_commerce_query \
  '{"endpoint":"catalogService","query":"{ categories(roles: [\"show_in_menu\"]) { id name level parentId urlPath roles } }"}'
```

then the same with `"customerGroupId": 0`, `1`, `20`, `21` (the groups in the item's
table). Read it two ways:

- **Does `categories` with no `ids` return the tree at all?** The reference documents
  `ids` as optional but every example passes one. If it returns `[]`, the block and the
  reader must walk from the store's root id with `subtree: {startLevel, depth}` instead
  (one `ids` entry). The block's query is one constant, `CATEGORIES_QUERY`.
- **Does it honour grants?** If groups 0 and 1 get Justrite's categories back (the item
  measured `productSearch` = 0 for them), `categories` ignores B2B permissions and the
  block's product-search filter (`FILTER_BY_VISIBLE_PRODUCTS = true`, built in) is
  needed. If they come back without them, the filter can be switched off.

### 5. First real run on Justrite

Needs: steps 1–4, plus the wiring in step 6 (or a one-off script calling
`applyCatalogMenu` with a DA.live/Helix page adapter). Then look at:

1. `https://main--kukla-justrite--skukla.aem.live/nav.plain.html` has the line and the
   block; `/safety-signs.plain.html` has the `<h1>` and the `product-list-page` row.
2. The header as a guest and as a Northgate buyer: menus differ the way the
   2026-10-01 table says they should (guest sees fewer, or none).
3. Click through to a category page as a Northgate buyer — products listed. As a
   guest, an empty page there means the menu showed something it should not have.
4. Browser console: no `catalog-menu:` errors; a mistyped `Shop the catalog: X` names X.
5. Undo, then the nav reads exactly as before and the category pages 404.

Not yet verified against the Justrite code itself: tonight's read of the header and
fragment code was the commerce boilerplate cloned locally (`isle5`), which loads the
nav through `loadFragment` → `decorateMain` → `await loadSections` and exports
`CS_FETCH_GRAPHQL` from `scripts/commerce.js`. Justrite is the ACO boilerplate; confirm
both on its `scripts/commerce.js` and `blocks/fragment/fragment.js` before step 5.

### 6. Surfaces (not built — each needs a decision)

- **Where the record lives.** The service returns a `CatalogMenuRecord` (pages written
  + hashes, whether the switch was added) and needs it back to re-run or undo.
  Recommendation: the EDS instance's `metadata.catalogMenu`
  (`componentInstances['eds-storefront'].metadata` is already a free-form record, so no
  schema change). Alternative: a file in the DA.live site, so the proof of authorship
  travels with the site.
- **Category reader.** Catalog Service `categories(roles: ["show_in_menu"])` with the
  project's store headers — the endpoint and headers `run_commerce_query` already
  assembles (`buildCommerceEndpoints` in `commerceEndpointsTool.ts`).
- **Page adapter.** `StorefrontPages` over `DaLiveContentOperations.readSource` /
  `createSource(overwrite)` + `HelixService.previewAndPublishPage` /
  `unpublishPage` + `deleteSource` — the calls `write_page` and `delete_page` make.
  Natural home: `contentAuthoringTools.ts`, which already resolves the storefront target.
- **Agent tools.** `build_catalog_menu` and `remove_catalog_menu` (the second
  confirm-gated). Follow `mcp-tool-authoring`: narration, alert copy for removal,
  count pins, `realSdkRegistration.test.ts`, `docs/systems/mcp-server.md`.
- **Human surface.** The item's design: a Storefront-area checkbox "Build the menu from
  the Commerce catalog" (default on for a catalog the project loaded) and the same
  action on the dashboard's storefront zone. The wizard path runs at creation; the
  dashboard path must produce the same result (property 3).
- **B2B grants.** The second half of the item (grant new categories to shared catalogs,
  verify per group, undo includes the grants) is not part of this build.

## Caveats carried from the item

- A category page shows nothing until Live Search has indexed the store view, and on
  B2B, until a shared catalog grants the category.
- The tree is the nav. A catch-all site wants product families at the top level; that
  is a catalog design question for the SC.
- No "All Products" entry is generated; an SC can type one by hand.
