# Step 09 — Export → Storefront as demo package (was "Share this demo", then "Save as demo package")

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

## Built (2026-09-13)

**Host.** `sharedDemoFile.ts` is the ADR-013 rule over GitHub: the file is rewritten or
removed only when its blob sha is the one the project recorded (`Project.sharing.fileSha`);
a file present with another sha, or present with none recorded, is skipped and the reason
says it was not written by Demo Builder or was edited since. `shareDemoService.ts` builds
the description file from the project alone (`describeProject`): codes under both key
families, flags, mesh posture (storefront over package), datapack, catalog and custom
integrations, block libraries, and the content site with the index path the probe's
convention resolves (`resolveOwnContentSource`; the fallback path with "not found" when
none answers). `shareChecks` answers in SC words: repository public or private, default
branch, page count or "no list of pages" with the Republish action, datapack in the service
(asked only when the Data Installer can be reached without a prompt; silent otherwise),
each custom app's repository readable. Three dashboard handlers (`getShareDemoPreview`,
`shareDemo`, `stopSharingDemo`), Edge Delivery only; the headless refusal names the how-to's
by-hand path. The template flag is set once and unset only when we set it.

**Human surface (as first built; see "Rehomed" below).** More → "Save as demo package" opens
`ShareDemoModal`: prefilled name and description, the checks as a dotted list, the
template tick box off by default, the link via `CopyableText` once saved, "Remove demo package"
beside "Save"/"Update". Mounted only while open, like Change source.

**Agent surface.** `get_share_demo_preview` (read), `share_demo` (confirm:true; the refusal
names the file, the name and the repository) and `stop_sharing_demo` (confirm:true and the
consent dialog). Narration, ceilings, battery prompts, auth totals (github 14 → 17, tools
113 → 116), the tool catalog and the alerts list updated.

**Live (2026-09-13, isolated dev host, the owner's Bodea project).** `get_share_demo_preview`
answered the prefilled name and description from the Bodea card, "skukla/kukla-bodea is
public", the default branch, 157 pages indexed, the datapack in the service, and the link.
The first run refused the project as "not an Edge Delivery project": the service read a
`daLiveSite` field off the storefront instance that a real project file does not carry (the
site name is the repository name; `getEdsDaLiveTarget` knows that, and the service now uses
it). The write (`share_demo`) was not run live: it puts a file into the owner's real
repository, which is the owner's call; `stop_sharing_demo` takes it back out.

**Renamed and widened the same day (owner, 2026-09-13).** The owner pushed back on
"Share": it implies the whole demo leaves, when what leaves is the storefront as a starting
point plus the defaults the file records, and Export already means the settings file that
carries the environment. What the action produces is a demo package in the glossary's sense
(a card on the Welcome step), so it is **"Save as demo package"** / **"Remove demo package"**,
and Save now also puts the card on the SC's own Add a demo list (`rememberAddedDemo`, the
same row a colleague's add builds, with the default branch), so reuse and handing over are
one act and the link is just how a colleague gets the same card. Remove takes the card off
the list too. Identifiers followed the words: `demoPackageHandlers.ts`,
`demoPackageService.ts`, `DemoPackageModal`, `useDemoPackage`, `demoPackageTools.ts`
(`get_demo_package_preview`, `save_demo_package`, `remove_demo_package`),
`Project.demoPackage` (was `sharing`). The description file keeps its name (`SharedDemoDescription`,
`demo.demo-builder.json`): that is the file format, read by the probe since step 03.

**Rehomed under Export (owner, 2026-09-13).** The owner's direction, now the decision of
record on [[PL-56]]: Export is the umbrella for everything an end user touches, and a
sibling row would ship the very confusion this step was meant to remove. The More row is
**Export** and opens `ExportModal` (`dashboard/ui/components/export/`), one section per part:
"Setup file" (the existing save flow, one button) and "Storefront as demo package"
(`DemoPackageSection`, EDS only, with its own Save and Remove buttons). `DemoPackageModal`
is gone; `useDemoPackage` and the handlers are unchanged; the agent tools keep their names
since an agent picks parts by tool. Every sentence in the dialog was tightened the same day
(the walkthrough the owner asked for is in the session; the copy lives in `PACKAGE_COPY` and
`EXPORT_COPY`).

**Two verbs, two doors (owner, 2026-09-13, later the same day).** The owner drew the line
that settled the naming for good: saving a package is about the SC (a new card on their own
Welcome step, from a demo they built), exporting is about someone else (handing over an
artifact). "Save as demo package" went back to its own More row and its own dialog
(`DemoPackageModal`); Export became two questions, how it travels (a link or a file) and
what goes (the parts), with the storefront-by-link part depending on the package existing
and pointing at the Save door when it does not. The file form writes one bundle
(`demoBundle.ts`, `exportDemoBundleHandler.ts`, `export_demo_bundle`), which the zip door
reads. The dashboard's old direct settings export (`exportProject`) is gone: the file form
with Setup alone is that path. The Welcome card's Remove is always visible and never offers
to delete a repository that is one of the SC's own storefronts.

**Not built, by decision.** "Publish it now?" for a missing datapack waits on [[DI-3]]. The
"Make it public?" offer for a private custom app is a sentence, not a button, for now: the
check names the repository and says colleagues need access. The open question below stays
open.

## Changed after the first live look (2026-09-14, owner)

- The loading state is the spinner alone; the intro paragraph arrives with the form.
- No help text under the name field.
- "What colleagues get" says what a colleague gets, in plain words: no branch name (true of
  every project), no page count, no "is public", no "datapack service". The sample-data line
  confirms the pack exists in the service and uploads nothing.
- Reset carries the description file (`readSharedDemoFile` → the reset's file overrides)
  for a project with a package record. Found while answering "what if the repo already
  exists": the reset replaced the tree and the file was silently gone while the project
  still recorded a package.
- Export: the "What goes" list is gone. The link form is the link and Copy link. The owner
  asked why being a package was a prerequisite for the link; it was not one: the probe reads a
  storefront with no description file (`sharedDemoProbe`, absent-tolerant). Then: "get rid of
  the scary-looking warning and requirement". Copy link now writes the description itself the
  first time (`saveDemoPackage`, the prefilled draft) and copies; one calm line says so. The
  Export → Save hand-off (`saveDemoPackageFromExport`, `onSaveDemoPackage`) is gone. The
  dialog reads the storefront before showing anything, in the house spinner.
  The file form's list is "What to include" with the two parts that exist; the greyed
  "Not yet" rows for datapack, content and integrations are gone. A dialog is not a roadmap.
- The template tick box is gone, with `markTemplate`, `templateFlagSet` and
  `templateFlagUnset`. It served only the by-hand "Use this template" path, and a copy made
  from a template has no upstream, so "Jen has updated this demo" could never work for it.

## Open

- Whether Share should also verify the five load-bearing patches are present in the SC's
  repo and say so (it is our repo this time, so the answer is normally yes).
