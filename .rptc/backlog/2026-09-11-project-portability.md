---
id: PL-56
kind: epic
area: platform
parent: EDS-13
needs: []
value: high
status: planned
---

# Project portability: export, import and copy carry the whole project

Filed 2026-09-11 by the owner as the second track of [[EDS-13]]: the builder can export and
import a project's settings and copy a project, and that capability "has grown horridly
stale". Measured the same day: `.rptc/research/project-import-export/research.md`.

## What is wrong, in one paragraph

The settings file was designed in December 2025 to reuse component config values between
creations. The project has since grown a title, a Commerce instance, a datapack, App
Builder integrations with deploy state, block libraries, an EDS storefront with its own
state, and AI files, and the file carries almost none of it. Import then creates the new
project with integrations and mesh hardcoded empty whatever the file said, asserts GitHub
and DA.live are signed in, and ignores custom integration sources and API picks. The
format has one version number that has never changed and no migration. Both dashboard
export doors write secrets unconditionally. Edit mode is fed by the same serializer, so
every field export drops is a field Edit can delete.

## Children (filed 2026-09-11, in run order after the contract)

| Item | Kind | What |
|---|---|---|
| [[PL-56a]] | feature | The contract: v2 file, the travels/local split, no credentials in the file, names, migration |
| [[PL-56b]] | chore | Delete what is already dead (runs first, independent) |
| [[PL-56c]] | feature | Export carries the whole project, never a credential |
| [[PL-56d]] | fix | Import creates what the file says, re-proves sign-ins, tells the SC what it did |
| [[PL-56e]] | fix | Copy and Edit read the same complete file |
| [[PL-56f]] | feature | Agent tools for import and copy |
| [[PL-56g]] | chore | A feature page |

Decided 2026-09-11 (owner): everything can travel; stale context is re-proven through the
existing prompts before anything continues; credentials stay in VS Code SecretStorage and
the design keeps using it.

## Decided 2026-09-13 (owner): Export is the umbrella

"Export" is the one door for handing a demo to someone else to use, and it grows to cover
every touch point an end user has. One More-menu row, one dialog. Refined the same day:

- **Two questions, not one list.** HOW it travels — a link (the colleague can reach the
  SC's GitHub and the shared services; history and later changes flow) or a file (one
  bundle, `<project>-demo-bundle.zip`, of the ticked parts) — and WHAT goes (the parts).
  Parts not built are shown greyed so the shape is visible.
- **Export is not Save as demo package.** Saving a package is about the SC: a new card on
  their own Welcome step from a demo they built, with its own More row, dialog and undo.
  Export is about someone else. They touch in one place: sending the storefront by link
  requires it to be a package, and Export points at the Save door rather than saving on
  the SC's behalf. Sending by file has no such dependency.
- **The receiving side mirrors it.** "Add a demo" takes a link, a storefront zip, or a
  bundle (its `storefront/` folder). Setup from a bundle is [[PL-56d]]'s import work.
- **Remove on the card.** An SC removes a card they added from the Welcome step itself; the
  affordance is always visible, and it never offers to delete a repository that is one of
  their projects' storefronts.

| Part | What leaves | State on 2026-09-13 |
|---|---|---|
| Setup file | the settings file a colleague imports (Commerce, Adobe, GitHub and DA.live names) | exists; still carries credentials, which [[PL-56c]] removes |
| Storefront as demo package | the description file in the SC's repository, the card on their Welcome step, the link | built ([[EDS-13b]], shareable-demo step 09), as the dialog's second section |
| Storefront, by file | in the bundle: the repository's code with the description file inside; the receiving half is "Or add from a zip file", which reads a bundle | built 2026-09-13 as the file form's storefront part, after the owner made the file form first-class (the recommendation had been to leave it to GitHub's own download) |
| Datapack | the SC's sample data published to the datapack service | waits on the service being able to export rows ([[DI-3]]) |
| Content | the DA.live pages | today they travel by being published, and a project built from the card copies them; a content bundle is unbuilt |
| Integrations | custom apps' repositories readable by others | today a check and a sentence; the confirmed "make it public?" offer is in [[PL-56c]] |
| Storefront theme | a storefront's look, separate from its code | unbuilt; whether a theme is a separable thing in EDS is open |

Words, settled the same day: not "Share" (it promises the whole demo when only a part
leaves), not "Export project" (same promise), not "Export settings" (an SC new to the result
would not know why they'd want it). The parts are named by what they are; the row is the
umbrella.

## Relationship to the shared-storefront track

A shared storefront is a piece of a project. The description file [[EDS-13c]] defines
must be the same slice of the project file this track defines, or the builder ends up with
two ways to describe one storefront. That is why both sit under one program.

## Shipped so far

- 2026-09-11  Cut into six children; D24-D25 decided (6a66780e6)
- 2026-09-11  chore(backlog): log the cut commit on PL-56 (`1416a2075`)
