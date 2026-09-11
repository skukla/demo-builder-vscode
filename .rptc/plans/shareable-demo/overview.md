# Shareable demo — feature plan (living; iterated with the owner)

Items: [[EDS-13a]] Add a demo · [[EDS-13b]] Share this demo · [[EDS-13c]] the published
process. Part of the program [[EDS-13]] (`../portable-demos/overview.md`, which holds the
full decisions ledger D1–D15 and the contract step this feature builds on). Research:
`.rptc/research/colleague-storefront/research.md`. This file is where the FEATURE's design
iteration is logged; the program overview is where the tracks are ordered.

## Goal, in the SC's words

"Build my project on the demo Jen made" works the way "build it on CitiSignal" works: pick
a card, carry on. And "let Jen build on mine" is one action on my project.

## The experience, as accepted (2026-09-11)

**Welcome step.** The grid of demos gains a plus card at the end: "Add a demo", described
"Use a demo a colleague built, or one of your own. You'll need its link." Demos the SC has
added before are ordinary cards ("Isle5 by Jen", "Edge Delivery").

**The dialog.** Clicking the plus card opens the same dialog the Integrations area uses to
add an integration, over the dimmed wizard. Stage 1: a list of demos added before, or a
single field "Link to the demo" with live validation ("Enter a GitHub link, like
https://github.com/name/demo"; "You've already added this demo."). Continue shows "Looking
at this demo…" while the extension reads the repository, then stage 2: an editable name
prefilled from the repository, a short read-only table "What we found in this demo"
(storefront kind, published pages, store codes), and, only when the extension could not
tell, a switch "Uses company (B2B) features", off, with two lines: why we are asking and
what happens if it stays off wrongly. Below the table, a tick box, on by default: "Keep my own copy of this demo's code, so it
still works if the original changes", naming the account or team org it goes to (the
repo step's namespace picker). Back and "Add demo". Adding creates the fork when ticked,
closes the dialog; the new
card is selected; the plus card moves to the end; the link is remembered in the SC's VS Code
settings for next time.

**Failure paths.** A repository that is not a storefront: "This doesn't look like a demo
we can build on", naming what is missing. A storefront with no published content: stage 2
still appears, the content row says the site will start empty unless the owner publishes,
and Add still works.

**Build Your Project.** Unchanged in shape. Commerce: the three store codes are prefilled
from the demo, the SC supplies the backend address and secrets as for any brand.
Storefront: the summary's first row names the demo and its frontend kind; the demo's pages
copy automatically when a published index exists (a note says the site starts empty when
not); the demo's blocks, palette and example pages arrive regardless. Integrations: the mesh toggle
is shown.

**After creation.** Reset goes back to the demo's source (the SC's fork when they kept a
copy, else the colleague's `main`) and re-copies their content; for a forked demo the
update check says "Jen has updated this demo: N changes. Pull them in?" and one click
merges them;
Configure opens with the demo card present; republish keeps the B2B flags; the update
check compares to their `main`. Caveats from the dry check of our five load-bearing
patches read in SC words ("Product deep links may 404 on this storefront").

**When the original disappears.** A forked demo does not notice. An unforked one shows a
notice on the project, reset refuses up front with the same sentence, renames are followed
silently, and "Change source" points the project at a new link or a fork made now. When
the content site is gone, reset offers to keep the current content.

**What the SC never sees.** GitHub API calls, `fstab.yaml`, `config.json`, the template
flag, "storefront row", "custom", "shared", "import", "repo", "template".

**Share this demo.** On a project the SC built: writes the description file into their
storefront repo, checks what a colleague's Add will need, offers the template flag as an
off-by-default tick box, hands over the link. "Stop sharing" reverses it. Details still
open (step 09).

## The gate this feature is built under

Every surface, pattern and word is an existing one. The mapping is research §9a; each step
names the rows it reuses. A new component, hook, stage shell, settings shape or noun has to
say which row it replaces and why the row would not do. `reuse-first` fires on any new file
under `ui/`.

## Steps

| Step | Slice | Depends on | Item |
|---|---|---|---|
| — | The contract (program plan, `../portable-demos/step-01-contract.md`) | — | PL-56a |
| 01 | One resolver for a project's storefront; the eleven catalog lookups move onto it | contract | EDS-13a |
| 02 | Starter: rename the unbranded brand | — | EDS-13a |
| 03 | The probe handler | contract | EDS-13a |
| 04 | The door: plus card, dialog, remembered demos | 03 | EDS-13a |
| 05 | Creating a project from an added demo | 01, 04 | EDS-13a |
| 06 | Living with it: reset, edit, republish, names, update check | 01, 05 | EDS-13a |
| 07 | Agent surface for add | 03, 05 | EDS-13a |
| 08 | Publish the process | contract | EDS-13c |
| 09 | Share this demo (shape decided, details open) | contract, 08 | EDS-13b |

Step 01 is the representative vertical slice: if the eleven sites fight the resolver, the
design is revised before step 03.

## Design iteration log

Dated, in the order the questions were asked. Each line: the question, the answer, what
was rejected and why. Detail in the research sections named.

- **2026-09-11 · Identity.** Own brand card, not a swap under a shipped brand, not
  per-storefront inheritance. A colleague's repo need not match a shipped brand's store
  codes, flags or ledger. (research §6.2)
- **2026-09-11 · Sharing.** Paste a URL and remember it; no manifest required of the
  colleague in v1. Rejected: URL each time (re-pasting weekly), manifest-only (blocks anyone
  whose colleague did not write one). (§6.3)
- **2026-09-11 · Scope.** EDS and headless together; the probe tells them apart. (§6.1)
- **2026-09-11 · Reset and patches.** Owner asked "to what extent CAN and SHOULD we control
  the boilerplate and patches?" Answer recorded: we can observe provenance, shape and each
  patch's fit, and cannot control currency or what they push later; we should own the
  integration contract and not their code. Decision: their `main`, report only; the five
  load-bearing patches dry-checked. Rejected: opt-in patching (edits code the colleague
  changed on purpose), pinning to a creation SHA (kept as a possible later mode), disabling
  reset (breaks P1). (§6.4)
- **2026-09-11 · Content.** Copy published content by default, skippable; probe the index
  first. (§6.5)
- **2026-09-11 · "Just another storefront".** Owner reframed: how far from a shipped
  storefront is the plan, and what closes the gap. Measured row by row (§8): after the
  resolver, nearly everything is the same code path; five gaps remain, three closable by
  reading the repo's own files, one (patches) by decision, one (available to every SC) only
  by a team catalog. Three levers named: derive from the repo, an in-repo catalog row, a
  team catalog.
- **2026-09-11 · Prefill.** Exactly what shipped brands prefill: the three store codes.
  Rejected: also the backend address (owner: match shipped behaviour). (§9)
- **2026-09-11 · Unreadable config.json.** Owner asked what it means for health. Answer:
  nothing for the storefront (we regenerate `config.json` wholesale), everything for the
  B2B flags (silent empty account menu, ADR-009). Decision: never refuse the card; detect
  B2B from `config.json`, then dependencies; switch only when both fail. (§9)
- **2026-09-11 · Single gate.** Owner proposed a dedicated storefront type behind one card,
  configured during creation; remembered list on the existing settings pattern. Accepted;
  the configuration runs on the Welcome step because Commerce comes first and needs the
  store codes. (§9)
- **2026-09-11 · Custom vs Shared vs the level.** Three rounds. Owner accepted renaming the
  shipped "Custom (B2B + B2C)" to Starter. "Custom" rejected for the door: reads as
  make-it-yourself beside Starter and names the mechanism, not the intent. "Shared" rejected:
  two readings (collaborated on vs given to you). Owner raised the LEVEL: a storefront is a
  stack piece, not a brand. Answer: what a colleague shares is a brand bundle (code +
  content are inseparable in EDS), so it belongs on the grid of demos, and the grid word is
  "demo". "Import" rejected (the wizard's settings-import mode). "Demo from GitHub" rejected
  (technical). Decision: a plus card, "Add a demo". (§9)
- **2026-09-11 · Communication.** Owner asked how the panel appears and how the SC
  interacts with it; the description above was accepted with the reuse caveat that became
  the gate. (§9a)
- **2026-09-11 · The description file (option 2).** Explained as a requirement; accepted as
  a PUBLISHED contract; the file wins over what we read and we say what it overrode; scope is
  exactly what a shipped catalog entry may say. (§10, §10a)
- **2026-09-11 · Export and MCP.** Owner added: capture export of a storefront ("Share this
  demo", not "export", which is settings export) and agent tools for both halves. (§10)
- **2026-09-11 · Team catalog (option 3).** After add and share ship. (§11)
- **2026-09-11 · One contract.** The description file is the storefront slice of the
  versioned project file; the program's first step. (§12)
- **2026-09-11 · Added demos on the grid.** An added demo is an ordinary card beside the
  shipped brands, one click to select, no dialog; the plus card stays at the end; the
  dialog's stage 1 also lists them. Rejected: dialog-only (two extra clicks, demo invisible
  until the door opens), a separate "Added by you" row (splits a grid that is not split
  today). The second visit is identical to picking a shipped brand.
- **2026-09-11 · File names.** One family, kind first, shared suffix: `.demo-builder.json`
  (manifest, unchanged), `<name>.project.demo-builder.json` (exported project),
  `demo.demo-builder.json` (the description file at a repo root). Rejected: keeping the
  export's current name (differs from the manifest only by a prefix, and the agent tool
  writes it beside the manifest); short coined extensions (jargon).
- **2026-09-11 · Share's inputs.** Prefilled from the brand the project was built on (title
  for a Starter build), icon from that brand with a picker for a repo image, all editable in
  the share dialog before the file is written. Rejected: no dialog (a Starter build would
  share as "Starter"), nothing prefilled (typing for the common case).
- **2026-09-11 · When the source disappears; fork on add.** Today a vanished template repo
  makes reset fail midway with raw git output and the update check go silent; nothing
  shows a project's source and nothing can repoint it. Owner asked whether to help the SC
  fork the repo. Decision: offer a fork into the SC's own account (or team org) at add
  time, ticked by default: the fork is the demo's source for this SC, projects generate
  from it, the update check offers "Pull Jen's changes" through the fork-sync service the
  extension already has (`forkSyncService.ts`), and Forget offers to delete the fork.
  Rejected: off by default (the default case keeps the exposure), always fork (a cloud write
  with no visible choice), notice-and-repoint only (a demo whose original is gone cannot
  be reset).
- **2026-09-11 · When the source is gone (unforked demos; content for all).** A dashboard
  notice; reset refuses up front with the same sentence; a GitHub rename is followed and the
  stored name updated; a "Change source" action reopens the Add dialog to repoint to a link
  of the same kind or to a fork made now; when the content site is gone, reset offers to
  keep current content. Rejected: notice only (midway failures stay), no repointing (one
  thing that cannot be undone).
- **2026-09-11 · Forgetting.** Forget always removes the card and never touches projects
  (they carry their own row). A tick box "Also delete my copy of the code" is off by default;
  the dialog names how many projects use the fork as their source and that they lose reset
  and updates until repointed; deleting the repo is confirmed once more, as project cleanup
  does. Deleting a project runs today's cleanup (`cleanupBehavior`: ask / deleteAll /
  localOnly) on ITS repo and site only; the fork is shared and never touched; the remembered
  demo stays. Rejected: ticked-when-unused (a default that deletes a repo the moment a count
  reads zero), never delete from Forget (clutter made permanent).
- **2026-09-11 · Updates.** Owner asked how the shipped-template updater applies. It applies
  whole, with no new mechanism: `checkUpdates.ts` already (1) asks whether a project's
  TEMPLATE repo is a fork behind its parent and offers a pre-ticked fork sync per repo
  (`checkForkSyncUpdates`, `checkUpdates.ts:362`), and (2) offers each project "N changes
  behind" its template with the merge-then-reset-on-conflict apply (`templateSyncService`),
  in one picker with one confirmation. Unforked demo: (2) against Jen's `main`. Forked demo:
  (1) for the fork plus (2) per project. Never LKG pinning or patches (D4). Two obligations:
  the updater reads the template from instance metadata (`getTemplateSource`,
  `updateTypes.ts:90`), so Change source and rename self-heal must keep it and the project
  row in step; and the reset-on-conflict fallback overwrites the SC's own edits, a
  pre-existing P2 concern that forking sends more traffic through (filed).
- **2026-09-11 · The Storefront area.** Accounts, namespace, Code Sync, the empty repo-name
  box and the site named after the repo are unchanged. Added: a first summary row naming
  the demo and its frontend kind, and the existing-repo tick worded "Reset to Isle5 by Jen"
  (same for shipped brands). Rejected: a sentence under the name box (one more line to keep
  true), nothing extra (the card is far away by then).
- **2026-09-11 · Pages, blocks and example pages.** Owner pushed back on a "copy content"
  tick because an SC expects the colleague's custom blocks to come with the demo. They
  always do: blocks are code, the palette is generated from the code, and the per-block
  example pages are copied from the demo's content site as library doc pages regardless of
  anything else (the mechanism shipped libraries already use). With that settled, D5 is
  AMENDED: pages copy automatically whenever a published index exists, skip with a note when
  not; no tick for any brand. Rejected: a tick for everyone (the empty-site choice was not
  wanted), a tick for added demos only (behaviour depending on where the demo came from).
  Owner then decided: a shared demo's blocks are associated with that demo only; Add never
  registers them as a library for other demos (D22). An SC who wants them elsewhere uses the
  custom block library setting by hand, as today.
- **2026-09-11 · Dry-check caveats.** Today's channels: the wizard's "Storefront Published,
  with warnings" list (fed by the PDP caveats) and a patch toast written for us (ids, targets,
  reasons). Decision: caveats worded by CONSEQUENCE, three lines for the five patches (product
  deep links may open an empty page; a product page with no product shows blank instead of
  redirecting; AEM Assets images may not load for SKUs with special characters), each ending
  "This storefront's owner controls its code; Demo Builder does not change it." Ids and
  targets go to the debug log only. Shown in the completion card at create, and reset gains
  the same list; the check re-runs on every reset; nothing persists on the dashboard.
  Rejected: per-patch lines (five lines, no extra meaning), today's toast (written for us), a
  persistent dashboard notice (nags about something the SC cannot fix), create-only.

## Open (this feature)

- The exact headless marker and B2B drop-in names, verified in step 03, never written from
  memory.
