---
backlog: EDS-71
status: active
---

Owner sign-off, 2026-11-23: "Yes" to doing all of EDS-71 on `feature/eds-71-block-library-content`.
Stops for the owner: step 4b (writes to our libraries' DA.live sites and Bodea's site config), step 5b's
choice for existing projects on the Classic authoring setting, step 8 (lifting the hold is a release
in the patches repository), and step 9 (live cycle).

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
- **DA.live / Experience Workspace**: the block list holds Adobe's blocks first, then every other block
  the storefront's code has, with the Commerce blocks grouped at the end. Each opens its example: a
  real use of the block where one exists, one per style, else a placeholder shaped like the block, as
  DA.live's own Import Blocks builds it. (Owner, 2026-11-23, replacing the Nov 8 lines that left out
  account, order, checkout, header and footer blocks and showed a "No example yet" page; detail in
  `step-02.md`.)
- **Dashboard, Storefront zone**: a **Draft Examples** tile, with an amber dot while any block has no
  example (hover: "13 blocks have no example"). It opens the SC's AI with the starter prompt; the AI
  shows the SC each drafted example, then writes it into the storefront's block list. The dot
  clears when every block has an example. **Refresh Blocks** is the one button that rebuilds the
  block list, doing what DA.live's Import Blocks does with nothing to type; its hover text says so
  ("Rebuild the DA.live block list from the storefront's code and pages"). No second button for
  Import Blocks (owner, 2026-11-23).
- **Configure, Block Libraries**: adding or removing a library updates the block list.
- **Prompts list**: a seeded starter prompt, **Draft Block Examples** ("Write an example page for each
  block in this storefront that has none. Read each block's code and description, and show me each page
  before you save it."), the same one the tile sends. (DA.live has no draft marker, so the SC checks
  each page before it is written; 2026-11-23.) An agent tool lists the blocks without an
  example.
- **Later**: Adobe's template updates go through; written examples and pages stay.

## Steps

| # | Step | Status |
|---|---|---|
| 1 | Measured: which blocks draw today | done |
| 2 | Connect Adobe's library (designed in `step-02.md`) | done |
| 3 | Add block library blocks from the library (with step 2) | done |
| 4 | Examples, best first (with step 2: the convention in `step-02.md`) | done |
| 4b | Our own libraries get real examples once | not started |
| 4c | Draft Examples tile, prompt and agent tool | done |
| 5 | Agent tools work on the DA.live library | done |
| 5b | Universal Editor stops being offered | done |
| 6 | Block library install, update, removal | done |
| 7 | The template update takes Adobe's deletion | done |
| 8 | Lift the hold | not started |
| 9 | Live cycle, with the owner's go | not started |

The detail of each step:

1. **Measured** (2026-11-08; research, "Can every block be previewed?"): of 352 blocks, 114 draw today.
   The rest are mostly account, order and checkout blocks (need a signed-in customer; not placed by
   hand), header and footer, Bodea's site missing its Commerce config, BuildRight having no site, and a
   real gap of blocks with no example and no use anywhere (Demo Team 10, Isle5 35, Bodea 50, Adobe 14).
2. **Connect Adobe's library** (built 2026-11-23, as designed in `step-02.md`): Adobe's blocks and
   templates are read from the package's Adobe source site's `/docs/library` sheets, their example
   pages copied from that site, and the site config gets its Blocks and Templates rows in one write.
3. **Every block the storefront has** (built with step 2): every `blocks/<id>/` folder is listed,
   none left out, after Adobe's blocks, with the Commerce blocks grouped at the end. Names as DA.live's
   Import Blocks writes them. `component-definition.json` is no longer read for the block list.
4. **Examples, best first** (built with step 2): the convention in `step-02.md` and the handbook:
   Adobe's page, the library's page, a real use (per style), else a placeholder shaped by the block's
   code. A page someone wrote is kept; an old Demo Builder placeholder is replaced.
   **What a good example is** (owner, 2026-11-23, after reading what Adobe intends): authors are
   visual; they want to see what they will insert, then know how to fill it in. DA.live's panel opens
   each block's example page rendered with the storefront's styles (the eye button), lists every
   example on the page as its own item named by the heading above it, inserts that example's table,
   and shows a `library-metadata` description behind an info button (`adobe/da-live`
   `blocks/edit/da-library/da-library.js`; aem.live "Set up library"). Adobe's own examples use
   neutral sample content in the block's real structure ("Your heading here", "Column 1 / This and
   that"; Cards as two named examples, "Cards w/ images" and "Cards w/o images"). So the target for
   every block without an Adobe example: neutral sample text and images, one named example per way of
   using the block, and a one-line description. A real use from another brand's site is a poor
   example; the shaped "Column N content" placeholder is the last fallback only.
   **Replaced 2026-11-24 (owner: "There's no way this should depend upon me collecting examples"):**
   the AI drafts an example for every block Demo Builder ships (the template's blocks Adobe does not
   cover, and every block in Demo Builder Blocks, Demo Team, Bodea, Isle5 and BuildRight) to the target
   above, and Demo Builder ships them as data. The build uses them after Adobe's page and a real use on
   the storefront's own pages, before the placeholder; image cells take a photo from the storefront's
   own pages. No writes to any library site. Tested two ways (owner: "ensure through testing that they
   show as they should as previews"): a structural suite on every checks run, and a render check that
   opens each example with the block's real code in a headless browser (block finishes loading, no
   script errors, visibly non-empty) and gathers screenshots into a contact sheet; Commerce blocks get
   the structure check only, stated as such. Pilot of a handful first, then the rest in batches.
4b. **Our own libraries get real examples once** (superseded by the paragraph above; kept as history): draft examples to that target (step 4c's tool),
   check them with the owner, and save them into each library's own DA site (Demo Team, Bodea, Isle5;
   BuildRight once it has a site), where every storefront using the library picks them up. Bodea's
   site lacking `config.json` only stops its pages rendering on its own site; copied tables render
   with each storefront's config, so it does not block this (corrected 2026-11-23).
4c. **Draft Examples**: the drafting itself, to the target above (one named example per variant,
   neutral content, a description), plus the dashboard tile with its dot, the seeded prompt, and an
   agent tool listing the blocks without an example; each draft is shown to the SC, then written into
   the storefront's block list (DA.live has no draft marker). A sample draft (Carousel) goes to the owner before the tool is built.
   **Approved 2026-11-23** (owner: "Yes" to the Carousel draft): two named examples ("Carousel, three
   slides", "Carousel, single slide"), each row image | heading + line + link, generic retail wording,
   images from the storefront's own media (neutral stock when it has none), and a `Library Metadata`
   description. That draft is the worked example the drafting skill carries.
   **Built 2026-11-23**: each library build records the blocks it left on a placeholder on the
   project (`metadata.blocksNeedingExamples`, `examplesNeededRecord.ts`; creation, reset, Refresh
   Blocks, Configure and the import path); the agent tool `list_blocks_needing_examples`; promote takes
   a whole example page and a `description` (a `library-metadata` table after each example, since
   DA.live reads one only for the example it directly follows) and takes the block off the record;
   the storefront-only skill `draft-block-examples` (AI_CONTEXT_VERSION 68); the seeded prompt; the
   Storefront zone's Draft Examples tile. No draft marker exists in DA.live, so the skill shows the SC
   each page before writing it, and the prompt ends "show me each page before you save it" instead
   of "mark each page as a draft for me to check".
4d. **Only blocks an author places are in the palette (owner, 2026-11-24; not built).** Of the 183
   shipped examples, 118 cannot preview, and most are not blocks an author inserts: 74 are the parts
   of the Commerce account, checkout, order, returns, company and purchase-order pages (several make
   one page, and the starter site ships every one of those pages with them in place: its
   `full-index.json`, read 2026-11-24); 7 are site plumbing loaded by code (header, footer, modal,
   widget); 21 are BuildRight's (left as they are: noted in `skukla/buildright-eds` issue 1). The owner
   agreed to three changes:
   1. Take the Commerce page parts and the plumbing blocks out of the block palette.
   2. Offer each Commerce page whole in DA.live's Templates list instead ("Order Details page"
      inserts that page's blocks in order), copied from the starter site's own page.
   3. Keep the authorable blocks that need a live store (Product Teaser, Recommendations, Targeted
      Block, Fragment, Catalog Menu, Form, Blog Tiles and the like), each with a short "How to use"
      note on its example page, or with the block library's own example page where it has one.
   This supersedes step 5's "one rule, no hide list" (2026-11-23) for these blocks: their code stays
   and the palette leaves them out, so the design must say where the list of left-out blocks lives
   and how removing or promoting a block keeps it in step.
5. **Agent tools.** `promote_block_to_library`, `remove_block_from_library` and
   `get_block_authoring_shape` work on the DA.live library (row and page) instead of
   `component-definition.json`; the generated skills that describe that file change with them (an AI
   bundle change: `AI_CONTEXT_VERSION`). **One rule, no hide list** (owner, 2026-11-23): the palette
   shows the blocks the storefront's code has. Promote gives a block its example and title; removing a
   block (after the same confirmation) takes out its page and row, then deletes its code
   (`blocks/<id>/`) and pushes, so the palette follows. Undo is putting the code back. Hiding a block whose code stays is dropped, so
   nothing else has to be kept in step.
5b. **Universal Editor stops being offered.** The `da-live-classic` authoring choice writes a Universal
   Editor URL into the site config (`daLiveSiteConfig.ts:33-54`, the `IMSOrgId` setting described as
   "Used to open the Universal Editor"); on a template without the UE files it opens an editor that
   cannot work. Remove what only served UE, in the same change (no soft deprecation), keeping DA.live's
   own document editing and Experience Workspace. **Owner, 2026-11-23:** keep the Classic choice; drop
   only the Universal Editor `editor.path` row, so Classic opens DA.live's document editor as its
   description says. Existing Classic projects keep their choice; the next settings apply (create,
   reset, Configure) clears the old row, so no migration. `IMSOrgId` stays (AEM Assets uses it); its
   description stops naming the Universal Editor.
6. **Block library install, update, removal.** Stop merging into the storefront's three UE files; the
   `addedEntries` record keeps working for storefronts that still have them until their next update.
7. **The template update takes Adobe's deletion** (built 2026-11-23). Nothing reads the storefront's
   `component-definition.json` after steps 2 to 6, so before applying Adobe's change the update removes
   Demo Builder's recorded entries (or the files, when only Demo Builder's entries differ), and the
   deletion applies. Existing storefronts get the content library on that update. As built
   (`authoringFileDeletion.ts`, `src/features/updates/README.md` "A file the template deletes"): a file
   that is the template's plus recorded entries still as the library added them is put back as the
   template had it and deleted; anything else stops the update by name; the GitHub update and the Fix
   with AI copy behave the same; a successful update or reset (or finished kept clash) forgets the record of
   files the storefront no longer has. The keep list from the 2026-11-23 bridge fix is removed.
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
