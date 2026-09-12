# Step 09 — Share this demo

Item: [[EDS-13b]]. Decisions: D11. Depends on the contract step (portable-demos/step-01-contract) and step 08. One question open at the bottom.

**Reuse:** section J of `../portable-demos/reuse-map.md` lists every existing thing this step is built from and how (use as is / add to it / make it shared / build new). A new file, hook, shape or word not in that section names the row it replaces and why.

## Scope (decided 2026-09-11)

Edge Delivery projects only. A headless project is a local clone with no repo of the SC's
own (`componentInstallation.ts:84`, `projectResetService.ts:437`); Share is not offered for
it and the how-to says how to share one by hand. Headless Share is [[EDS-13e]].

## Shape

Dashboard action "Share this demo" (the More menu, beside Export and Republish,
`ActionGrid.tsx` / `ProjectActionsMenu.tsx`), and an action tool for the agent:

1. Writes the description file into the project's storefront repo from what the project
   holds (name, description, store codes from the Commerce config, B2B flags, selected block
   libraries, mesh posture). Through the ADR-013 generated-file seam so a hand-edited file is
   skipped and reported, never clobbered.
2. Checks what a colleague's "Add a demo" will need and says so in SC words: content site
   published with an index (offers Publish if not); repo reachable; default branch `main`.
3. A tick box, off by default: "Also mark the repository as a template" (one GitHub settings
   write; unticking undoes it).
3a. Reachability checks (D32): the named datapack is in the datapack service (else: "Your
   demo uses isle5, which is not in the datapack service." — a warning only until the
   service can export rows, see [[DI-3]]; then "Publish it now?" behind the existing
   `start-datapack-export` door in `exportHandlers.ts`); each custom-app link is a repository others can
   read (else: "jen-adobe/pricing-app is private. Make it public?", a confirmed GitHub
   settings write, undone the same way). Curation is never touched. **Not a dependency (owner, 2026-09-11):** [[DI-3]] found the service cannot
   export rows today; Share ships with the warning and gains the offer when it can.
4. Hands the SC the link to send.

"Stop sharing" removes the file (only when the seam proves it is ours) and unsets the
template flag if we set it. Never "export" or "publish" in anything the SC reads.

## Decided 2026-09-11

The share dialog prefills name and description from the brand the project was built on
(the project's title for a Starter build); the SC edits before the file is written. Nothing is
written silently. No icon: the owner dropped the package icon on 2026-09-12 (no reader in the
code; nothing displays it), so neither the catalog nor the description file carries one.

## Open

- Whether Share should also verify the five load-bearing patches are present in the SC's
  repo and say so (it is our repo this time, so the answer is normally yes).
