# Step 09 — "Share this demo" (shape decided; details open)

Item: [[EDS-13b]]. Decisions: D11. Depends on the contract step (portable-demos/step-01-contract) and step 08. One question open at the bottom.

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
4. Hands the SC the link to send.

"Stop sharing" removes the file (only when the seam proves it is ours) and unsets the
template flag if we set it. Never "export" or "publish" in anything the SC reads.

## Decided 2026-09-11

The share dialog prefills name and description from the brand the project was built on
(the project's title for a Starter build) and the icon from that brand's icon, with a field
to pick an image file from the repo; the SC edits before the file is written. Nothing is
written silently.

## Open

- Whether Share should also verify the five load-bearing patches are present in the SC's
  repo and say so (it is our repo this time, so the answer is normally yes).
