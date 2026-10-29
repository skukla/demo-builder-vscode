# Second overnight loop — 2026-10-03 into 2026-10-04

## In short

Everything on the approved list is built, tested and committed, plus the ERP grid audit you added.
Nothing went live: no deploys, no store writes, no pushes to any main branch. Every commit was made
only after its repository's full test suite passed. The final Demo Builder result passes the full
quality gate (31,226 tests); the ERP passes all 621 of its tests.

## What changes for the person using Demo Builder

### Running a demo — the ERP screens

- **Every text, number, date and amount column in every ERP grid can be dragged wider or narrower.**
  30 grids, 174 columns: 91 that were stuck now resize; 17 stay fixed on purpose (line numbers,
  buttons, input boxes, the ten-digit number-series columns). A test fails if a text column ever
  loses resizing again.
- **No cut-off text and no sideways scrolling** on order lines (shorter "Qty" and "Unit" headings),
  Customers, Products and Pricing at a normal window size.

### Setting up a demo

- **Storefront setup waits for the GitHub App instead of wrongly assuming it is installed.** If the
  AEM Code Sync App is not on the repository, setup pauses with the install dialog and carries on
  once you add it.
- **Agents can set the store scope** (website, store, store view) when they create a project, so an
  agent-built demo shows the right products.
- **A storefront shows what it is built on** ("Built on Adobe's Commerce boilerplate 4.0.1") when
  you add it.

### Sharing and moving demos

- **Exporting a project and importing it again brings everything back** — integrations, mesh,
  datapack, store setup and every setting. A test checks every field.
- **Import and Copy no longer pretend you are signed in to GitHub and DA.live as the original
  owner;** they ask, the way a new project does, and the new project gets its own repository.
- **A saved demo package keeps receiving fixes,** and a colleague's storefront built from our
  templates can accept them (opt-in; written to your own copy, never theirs; never over hand edits).
- **A Storefront Report** says what a storefront is built on and which fixes fit — as a command, in
  Diagnostics, and to agents.

### Using an AI agent

- **"Open in Claude Code" tells you when Claude Code is not installed,** with a "How to install"
  button, instead of silently doing nothing; the AI badge stops showing a false green.
- **Agents can list a project's Adobe event setups and remove one** (confirmation and name check).

### Cleaning up

- **When Adobe has made a project read-only for you, removal explains it in plain words** and says
  who can fix it, instead of Adobe's raw error.

### Built up to your part (needs GitHub and DA.live)

- **Category pages and a menu built from the Commerce category tree.** The block, the page writer
  and its undo are built and tested; a new local block library holds the block. Creating its GitHub
  repository, adding it to the catalog and the first live run are the steps in
  `.rptc/plans/category-pages/overview.md`.

### Answered

- **Does one shared catalog per priced company scale?** For demos, yes; at a real B2B client's size,
  no — Adobe's search layer supports at most 1,000 customer groups, and every shared catalog is one.
  At scale: one catalog per ERP price group. `.rptc/research/shared-catalog-scale/research.md`.

### Behind the scenes (nobody sees these)

- Fifteen quality checks now see brand-new files; wizard warnings reach Debug Logs; 41 test suites
  use their shared mocks; the two largest files were split (981 → 386 and 834 → 369 lines); ten tests
  that checked nothing were deleted, each proven redundant by planting the defect it claimed to catch.

## Corrected along the way

- One build claimed a failing check was there before it started; a clean copy proved its own change
  caused it (four new setup-progress messages). The limit was raised with the reason written down.
- One new message passed GitHub's raw error text to the Storefront Report; it now goes through the
  existing GitHub error translator.
- A commit landed under the wrong title when a message file vanished; its content was exactly what
  passed the gate, and the title was corrected before anything was pushed.
- The machine's keep-awake timer stopped once at its two-hour limit and was restarted.

## Where everything is

| Repo | Branch | State |
|---|---|---|
| ERP | `loop/2026-10-03-night2` | 3 commits, pushed to GitHub, not on `main` |
| Demo Builder | `loop/2026-10-03-night2-combined` | everything from both streams, gate passes; local only |
| Block library | local folder `demo-builder-block-library` | 1 commit, no GitHub repository yet |

The Demo Builder branches could not be pushed to GitHub as new branches: a style check compares a
new branch to the old `master` and asks for a browser screenshot of stylesheets changed weeks ago.
They reach GitHub when merged into `feature/erp-integration`, whose push compares against the
already-published branch. The hook was not bypassed.

## Your decisions (walkthrough queue)

1. **Merge.** Demo Builder: fast-forward `feature/erp-integration` to
   `loop/2026-10-03-night2-combined`. ERP: merge `loop/2026-10-03-night2` into `main` (the next ERP add
   then picks up the grids).
2. **Shared demos, step 5 — storefronts on an older boilerplate.** Recommended: always report, apply
   the fixes that fit, never refuse because of age, warn below a minimum version.
3. **Category pages:** create `skukla/demo-builder-block-library` (recommended public), then follow
   the plan.
4. **Copying a project now gets its own repository** instead of sharing the original's. Recommended:
   keep (two projects on one repository can overwrite each other).
5. **"Brought in N settings from <file>" on import** is not built: what counts as one setting?
6. **Shared demos copy:** the plan says you review the new wording before it ships
   (`loadBearingPatches.ts`, `storefrontReport.ts`, and the report command's offer dialog).
7. **ERP number-series columns** stay fixed width; making them resizable needs a shorter heading.

## Live checks waiting for a set-up Justrite

- ERP grids: drag a few columns on the deployed ERP.
- Setup with a repository the Code Sync App does not cover: the pause, then "verified, resuming".
- Export a real project, import it, compare.
- Add a storefront by link (`sayurihanki/aistore`): the "Built on" row, the fixes offered after.
- "Open in Claude Code" on a machine without Claude Code.
- Plus everything still listed from the first loop's report.
