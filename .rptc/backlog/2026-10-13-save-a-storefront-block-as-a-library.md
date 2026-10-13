---
id: EDS-43
kind: feature
area: eds
needs: []
value: med
status: backlog
---

# Save a block from a storefront as a reusable block library

Filed 2026-10-13 by the owner. The case: an SC (or their agent) builds a block in one
demo's storefront, say a store switcher, and wants it in the next demo, and wants it to
survive a reset or a package change on this one.

## What exists today

- **Custom block libraries** are the reuse path (`docs/systems/custom-block-libraries.md`): a
  block repository added under `demoBuilder.blockLibraries.custom` in Settings and ticked in
  the wizard or on Configure's Block Libraries tab. Reset reinstalls custom libraries whatever
  the package (`collectLibrarySources`, `eds/services/reset/edsResetRepoHelper.ts`), and a
  package change in the wizard keeps them ticked (`resolveBlockLibrarySeed`,
  `project-creation/ui/steps/useProjectBuilder.ts`). Verified in the code, 2026-10-13.
- **`promote_block_to_library`** (agent only) adds a block to this site's own DA.live block
  library, the Insert Block list. It writes only to this project's repository and DA.live site
  (`readPromoteBlockContext`, `mcp/blockAuthoring.ts`). Its description and the
  `sync-changes` skill used to call it "push back to source library", which read as this
  feature; corrected 2026-10-13 (AI context v41).
- A block written into the storefront by hand is removed by Reset with the rest of the code.
  The old code stays in git history: the reset commit's parent is the previous head
  (`githubRepoArchive.ts`).

## The gap

Nothing takes a block from `blocks/` (and its authoring entries in the three component JSON
files) and puts it in a library repository a custom block library can point at. Today that is
manual: make a repository, copy the folder and the entries, add the setting, tick it.

## Design (owner walkthrough, 2026-10-13)

### Which blocks are the SC's

A block is the SC's own when its folder is in the storefront but neither in the template at the
commit the project records nor in any installed library's `installedBlockLibraries[].blockIds`.
Template blocks the SC changed are found by comparing with the template at that commit (the
removal path already compares by git blob sha). This detection comes first; everything else
reads it.

### The rule: new blocks, except header and footer

- **Everything else: build a new block, never edit the template's.** It is conflict-free and the
  save flow already handles it. Edits to other template blocks show in the save list as not
  savable: "Make your own block instead; edits to the template's blocks don't carry over."
- **Header and footer: edit them, and save them as replacements.** The standard Edge Delivery
  boilerplate loads blocks literally named `header` and `footer` (not verified against this
  repo's templates yet), so a block of another name never loads as the header. A saved one is
  recorded in the library (for example `demo-builder-library.json`) as replacing the template's.
  - Install and reset put it in place of the template's folder. On an existing storefront, only
    over a copy still exactly the template's; a hand-edited one is left and named.
  - Unticking the library puts the template's own back.
  - The library records the template it was made on; another template asks first ("This header
    was made on the B2B template. It may need that template's scripts. Use it anyway?").
  - Trade-off, stated in the flow: a replaced header no longer gets the template's header fixes.
    In effect that one block is the SC's own fork, the pattern ADR-006 moved the team's templates
    away from, so it stays an SC choice and packages do not use it.

### Version 1: four pieces

1. **The save flow.** "Save Blocks to a Library…" on Configure's Block Libraries tab, and
   `save_blocks_to_library` for agents, one handler. Steps: choose blocks (the SC's, plus header
   and footer as replacements, other changed template blocks listed as not savable); choose
   where (the SC's existing custom libraries first, then the wizard's existing GitHub
   choose-or-create step); review (nothing is written before this); save (one commit of the
   folders and their entries in the three authoring files, the library added to
   `demoBuilder.blockLibraries.custom`, ticked on this project and recorded as installed). The
   tool without `confirm` answers what it would save, so no separate list tool is needed.
2. **One offer, at the moment of loss.** Before a Reset or a package change in Edit, and only
   when unsaved SC blocks exist: "This storefront has 2 blocks you added (store-switcher,
   promo-strip). Resetting it removes them. Save them to a block library first?" [Save Blocks…]
   [Continue Without] [Cancel]. Saved and ticked, Reset reinstalls them by itself.
3. **One line in a tool answer, once per block.** `sync_storefront` pushing a new block that is
   saved nowhere says so once; that reaches every agent.
4. **One rule in AGENTS.md:** build new blocks, don't edit the template's; header and footer:
   edit them, then offer to save.

Rules that keep it quiet: nothing appears when nothing is unsaved; each nudge once per block,
remembered; nothing blocks a workflow ("Continue Without" is always there).

### Later, only on evidence

From field feedback, the agent-gap scan or session transcripts, not before:

- a first-save notice when an SC edits a template block;
- a standing "Your blocks" section on Configure;
- a dashboard badge for unsaved blocks;
- a Claude Code hook that stops template-block edits.

### Still open

- Where the button lives: Configure's tab only, or the dashboard too.
- A new library repository: private or public by default.
- The pre-loss offer: Reset as well as Edit, or Edit only.

### Known limit

Reset re-copies page content from the package, so a page where the SC placed a saved block comes
back without it. The block is available again; placing it is still by hand.

### Reversal

Unticking the library on Configure removes its blocks (and, for a replacement, puts the
template's back); deleting the repository is Manage GitHub Repositories.

Related: EDS-10 (themes as savable entities) asks the same question for themes.
