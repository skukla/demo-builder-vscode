# Step 10 — Add a storefront from a zip file

Item: [[EDS-13a]]. Decisions: D2, D4, D28. Depends on steps 04, 05 and 07. Asked for by the
owner on 2026-09-12, after a colleague's storefront arrived as a zip file "of all things".

**Reuse:** section G and section H of `../portable-demos/reuse-map.md` for the dialog, the
repository creation and the agent tool; new rows for this step are listed below.

## Goal

An SC who has a storefront's code as a zip file, not a repository link, can add it as a
demo. The zip becomes a repository in the SC's own GitHub account (D28: personal account
only), and from there everything is the added-demo path: the probe reads it, the row is
remembered, projects are created from it, reset and updates read from it, and Forget
offers to delete the copy.

## What was learned on 2026-09-12

The stand-in for this step's live check was exactly this case: a colleague's storefront
shared as a 47 MB zip with 9,944 files, no `.git`, no `node_modules`, a `.npm-cache/`
folder that must not be pushed, and an `fstab.yaml` in the nested `url:` form that the
probe could not read until that day. Pushed by hand into an organization repository, the
whole flow ran through the tools: probe, add (fork), create, reset, change source.

## The door

- The Add a demo dialog's link stage gains a second way in: "Or add from a zip file", a
  host file picker (`vscode.window.showOpenDialog`, zip only). The link field stays the
  first and default way.
- The host unpacks the zip to a temporary folder, drops what `.gitignore` would drop (and
  `.npm-cache/`, `.DS_Store`, a nested `.git/`), and refuses when the top level is not a
  storefront by the same rule the probe uses (`classifyRepoForStorefront` over the files).
- It creates a repository in the SC's account (`createEmptyRepository`, private by default
  with a tick box to make it public), pushes the files as one commit through the tree write
  `resetRepoToTemplate` already uses, and flags it a template (`setTemplateFlag`).
- From there the dialog continues on the found stage exactly as for a link: the probe reads
  the new repository, the SC names the demo, the row is remembered. No "keep a copy" box:
  the repository IS the SC's.

## The agent's door

`add_shared_demo` gains `zipPath` as a third way in beside owner+repo and `link`
(`mcp-tool-authoring`): the same unpack, refuse, create, push, then the existing add.
Confirm-gated when it creates a repository, in the same words the fork gate uses.

## The how-to

Step 08's how-to says: share the repository link, not a zip. A zip loses the history and
the colleague's later changes cannot be pulled. The zip door is for the case where that
already happened.

## Rules that carry over

Whoever names a content site names its index path (convention 113): the pushed
repository's `fstab.yaml` names the site, and the probe records the index path it finds.
The row is the project's own (D2); the code is never patched (D4).

## Tests first

The unpack-and-filter step over a fixture zip built from a small real storefront (what is
kept, what is dropped, the refusal for a non-storefront); the repository creation and
push against the GitHub fakes; the dialog's second way in; the tool's `zipPath` argument;
the how-to sentence.

## Built (2026-09-13)

**Host.** `zipStorefrontImport.ts` unpacks in memory with adm-zip (already a dependency),
strips the single root folder, drops what a repository never carries (`.git/`,
`node_modules/`, `.npm-cache/`, `.DS_Store`, `.env`) and what the zip's own `.gitignore`
says (names, directories, rooted globs with `*` and `**`; negations are not honoured, which
drops rather than keeps), and gives the probe's own verdict over the files through
`classifyRepoForStorefront` behind an in-memory file reader. `githubTreePush.ts` pushes the
files as one commit: text inline, fonts and images through `createBlob` (new on
`GitHubFileOperations`), trees in the request-sized batches `resetRepoToTemplate` uses.
`importStorefrontZipHandler.ts` picks the file when the webview asks without a path,
refuses in words ("This zip is not an Edge Delivery storefront: it has no …"), creates the
repository in the SC's own account (private by default; `createEmptyRepository` with
`auto_init`), waits for it, pushes, flags it a template, answers owner/repo. Registered on
the wizard map and, because the dialog is one component, on the dashboard map (44 → 45).

**Human surface.** The link stage's second section in add mode only: "Or add from a zip
file", the note that says to ask for the link when you can, a tick box "Make the repository
public" (off), and "Choose a zip file…". The found stage shows "Creating your repository
from the zip…" while the host works, then the same probe result as for a link; the
repository is the SC's, so no keep-a-copy box.

**Agent surface.** `add_shared_demo` takes `zipPath` (with `repoName` and `isPrivate`) as
the third way in: the tool reads the zip the way the handler will, refuses a non-storefront,
and gates the repository creation behind `confirm:true` with the refusal naming the
repository, the account, and the file counts. The added demo is then read from the new
repository and remembered without a copy.

**Tests.** The zip reader over a zip built in the test from the 2026-09-12 shapes (root
folder, `.npm-cache/`, its own `.gitignore`, a font); the push against a fake client
(arguments, not outcomes); the handler with the picker, the refusal and GitHub's "already
exists"; the flow and the dialog; the tool's gate and its confirmed path.

**Live (2026-09-13).** The read half only: `add_shared_demo` with the colleague's 47 MB zip
and no confirm answered the would-create refusal with the real counts. The confirmed run
creates a repository in the owner's account, so it waits for the owner.

**Export as a zip file (owner, 2026-09-13: a first-class part of Export).** The other half
of the zip door, built the same day after the owner overruled the recommendation to leave
it to GitHub's "Download ZIP": `storefrontZipExport.ts` puts the description file into the
repository archive GitHub serves (`downloadRepoArchive`, now public on the file operations),
`exportStorefrontZipHandler.ts` asks where with the save dialog from the webview or writes
`<repo>.zip` inside the project directory for an agent (a given path must resolve inside
it, the settings export's rule), and the Export dialog's third section "Storefront as a zip
file" and the `export_storefront_zip` tool call it. Dashboard map 45 → 46, tools 116 → 117.

**The import lane (owner, 2026-09-13, "Do it").** A bundle's setup part is read now, not
ignored. `readStorefrontZip` parses `setup.demo-builder.json` through the settings
serializer; `createRepositoryFromZip`, `cardFromZip` and `setupForCard` (the setup made the
colleague's own: the card the storefront became, the sender's repository and site names
dropped) are shared by two doors. The projects list's Import takes `.zip` as well as `.json`
(`pickImportFile` / `importSettingsFromUri` / `importDemoBundle`): repository, card, then the
wizard pre-filled. The dialog's zip door answers the setup and offers "Start a project with
it" (`use-bundle-setup`: the wizard cannot take settings while open, so it is closed and
reopened the way Import opens it). The agent's add answers `setupIncluded` and where to use
it. Still open from [[PL-56d]]: re-proving the sign-ins the setup names, and telling the SC
what was applied.

## Done when

A zip of an Edge Delivery storefront becomes a demo on the Welcome grid through the dialog
and through the agent's tool, and a project created from it resets and updates from the
new repository.

**Revised 2026-09-14 (owner review).** The first stage showed the link field and the whole
zip section at once, plus the demos already added, and read as too busy. It now asks
**Where is the demo?** with two choice cards, **From a link** and **From a zip file** (the
shape of Export's "How will you hand it over?"), and shows only the chosen way's form. The
zip's action is the footer's main button, **Choose a zip file…**. The list of demos already
added is gone: each is a card on the Welcome step behind the dialog, and removing one
happens on that card. The intro line is gone in add mode; change mode keeps its lead. The
"Creating your repository from the zip…" spinner now shows for the whole push; it used to
render only on the found stage, which the dialog reaches after the push.
