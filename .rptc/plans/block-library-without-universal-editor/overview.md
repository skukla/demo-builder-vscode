---
backlog: EDS-71
status: planned
---

# The DA.live block library, driven by content, not `component-definition.json`

Owner, 2026-11-08, after F67: roll the B2B pointer back, research, then plan. Research and sources:
`.rptc/research/ue-retirement-component-definition/research.md`. **Before beta.153** (owner,
2026-11-08: "Otherwise, we'll have broken storefronts all over the place"). Meanwhile the B2B hold
(`eds-demo-patches` `b2b/last-known-good.hold`) keeps every storefront on a template with the file.

## The goal

Every block a storefront has is pickable in DA.live (Experience Workspace) with a useful example, and
Demo Builder maintains no block metadata of its own:

- **Adobe's blocks** follow Adobe's content: the `/docs/library` Adobe ships with each Commerce source
  site.
- **Block library blocks** follow the library: its own DA site's example pages, or a real use of the
  block on that site.
- **Blocks an agent makes** take their example from the page they were made from.
- Demo Builder copies, points everything at the new storefront, and switches the library on.

The storefront's `component-definition.json`, which Adobe deleted with Universal Editor, stops
mattering, so Adobe's current templates can be taken again.

## Why now

Adobe retired Universal Editor with DA (hlxsites/aem-boilerplate-commerce#1454) and deleted
`component-definition.json` from both Commerce templates. Demo Builder builds the DA.live palette from
that file, so on Adobe's current template: updates stop (F67), the palette goes empty silently on a new
project, a reset or a refresh, block libraries stop registering their blocks, and three agent block
tools fail.

## What Adobe gives, and what it lacks

- Adobe's source sites ship a library in content: `/docs/library/blocks.json` (curated: 10 non-B2B, 7
  B2B), a page per block, `templates.json`. Demo Builder already copies it at creation and never
  connects it.
- The B2B sheet points at the non-B2B site (a copying mistake Adobe knows of): every copied path must
  be rewritten to the new storefront.
- Custom blocks have few real examples today: Demo Team 12 of 53 from its DA site, 2 more from
  sample markup; the rest are placeholder pages. The gap exists now; this plan closes what it can.
- Reading needs no new permission: example pages are read from public preview sites (`*.aem.page`);
  only the SC's own storefront is written, with the sign-in creation already needs.

## What the SC sees (owner, 2026-11-08)

- **Wizard Block Libraries step**: unchanged; library cards stay clean (no example counts).
- **Creating**: the progress window's block library step as before; the finished screen stays exactly
  as today (owner: a missing example is not a failure, and the success screen is not where to say what
  is left to do).
- **DA.live / Experience Workspace**: the block list holds Adobe's placeable blocks and every placeable
  block from the storefront's libraries, each opening its example. Account, order, checkout, header and
  footer blocks are not listed (their pages are built). A block with no example opens a short page:
  "No example for this block yet. Ask Demo Builder to draft one."
- **Dashboard, Storefront zone**: a **Draft Examples** tile, with an amber dot while any block has no
  example (hover: "13 blocks have no example"). It opens the SC's AI with the starter prompt; the AI
  writes each example into the storefront's block list, marked as a draft for the SC to check. The dot
  clears when every block has an example. **Refresh Blocks** stays as it is.
- **Configure, Block Libraries**: adding or removing a library updates the block list.
- **Prompts list**: a seeded starter prompt, **Draft Block Examples** ("Write an example page for each
  block in this storefront that has none. Read each block's code and description, and mark each page as
  a draft for me to check."), the same one the tile sends. An agent tool lists the blocks without an
  example.
- **Later**: Adobe's template updates go through; written examples and pages stay.

## Steps

1. **Measured** (2026-11-08; research, "Can every block be previewed?"): of 352 blocks, 114 draw today.
   The rest are mostly account, order and checkout blocks (need a signed-in customer; not placed by
   hand), header and footer, Bodea's site missing its Commerce config, BuildRight having no site, and a
   real gap of blocks with no example and no use anywhere (Demo Team 10, Isle5 35, Bodea 50, Adobe 14).
2. **Connect Adobe's library.** At creation, reset and refresh: take the copied `/docs/library`
   (`blocks.json`, the block pages, `templates.json`), rewrite every path to the new storefront, and
   write the site config's `library` rows (Blocks, Templates). Replaces reading
   `component-definition.json` for Adobe's blocks. Also read `/docs/library` where the code reads
   `/.da/library` today (Adobe's 2026-10 move).
3. **Add block library blocks from the library.** For each library a storefront has: a row and page per
   block, the page copied from the library's DA site where it has one (`docs/library` or `.da/library`,
   public preview), else from step 4, else a placeholder. Names from the block's folder (or a title the
   library gives). The library's own `component-definition.json`, if it has one, is a fallback for
   names and sample markup only, never the storefront's copy.
4. **Examples, best first**: the library's own example page; else a real use of the block on its
   library's site (its table copied from the page); else the "No example yet" page. Only placeable
   blocks are listed (commerce account, order, checkout, header, footer left out, as Adobe does).
4b. **Our own libraries get real examples once**: fix Bodea's site Commerce config and re-check its pages
   in a real storefront; draft (step 4c's tool), check and save the missing example pages into each
   library's own DA site (Demo Team, Bodea; BuildRight once it has a site).
4c. **Draft Examples**: the dashboard tile with its dot, the seeded prompt, and an agent tool listing the
   blocks without an example; drafts are written into the storefront's block list, marked as drafts.
5. **Agent tools.** `promote_block_to_library`, `remove_block_from_library` and
   `get_block_authoring_shape` work on the DA.live library (row and page) instead of
   `component-definition.json`; the generated skills that describe that file change with them (an AI
   bundle change: `AI_CONTEXT_VERSION`).
5b. **Universal Editor stops being offered.** The `da-live-classic` authoring choice writes a Universal
   Editor URL into the site config (`daLiveSiteConfig.ts:33-54`, the `IMSOrgId` setting described as
   "Used to open the Universal Editor"); on a template without the UE files it opens an editor that
   cannot work. Remove what only served UE, in the same change (no soft deprecation), keeping DA.live's
   own document editing and Experience Workspace.
6. **Block library install, update, removal.** Stop merging into the storefront's three UE files; the
   `addedEntries` record keeps working for storefronts that still have them until their next update.
7. **The template update takes Adobe's deletion.** Nothing reads the storefront's
   `component-definition.json` after steps 2 to 6, so before applying Adobe's change the update removes
   Demo Builder's recorded entries (or the files, when only Demo Builder's entries differ), and the
   deletion applies. Existing storefronts get the content library on that update.
8. **Lift the hold.** In `eds-demo-patches`: delete `b2b/last-known-good.hold`, re-apply the SKU patch
   rewrite (63c7d0f), release; the patch canary updates the canary storefront to Adobe's current
   template and must stay green.
9. **Live cycle, with the owner's go.** On a test storefront: create (palette lists Adobe's and the
   libraries' blocks with examples), reset, refresh, add and remove a library, promote a block, and take
   the template update. Then the walk.

## Out of scope, and open

- **The root `last-known-good`** (F68): read by no current package; decide whether to delete it.
- **BuildRight and Isle5** run on their own templates: check whether they still carry the UE files.
- **Adobe's curated subset**: whether a demo needs more of Adobe's blocks in the palette than Adobe lists
  (step 1 informs it).
- **Site Access**: a library whose content site is protected cannot be read without sign-in; its blocks
  fall back. Unchanged from today.

## Surfaces (hit every surface)

Creation and reset and refresh and Configure (all build the library); the template update; the three
agent tools and their generated skills (AI bundle); the block library install/update/removal; the
patches repository (the hold). Docs that state the library's source: `docs/systems/` EDS docs, the
`eds-publish-and-config` skill if it names `component-definition.json`.
