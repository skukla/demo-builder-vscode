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

## Done when

A zip of an Edge Delivery storefront becomes a demo on the Welcome grid through the dialog
and through the agent's tool, and a project created from it resets and updates from the
new repository.
