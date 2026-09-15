---
id: EDS-13g
kind: feature
area: eds
parent: EDS-13
needs: []
value: med
status: planned
---

# A headless project keeps its code in a repository of the SC's own, as Edge Delivery does

Filed 2026-09-15 from the owner's review of the copy removal (shareable-demo step 11).
Replaces [[EDS-13e]], which asked only for "Share a headless demo"; this is the change that
makes that share, and several other doors, possible.

## Why

An Edge Delivery project has two copies of its code: a repository in the SC's GitHub account,
created at project creation from the demo's source, and a local clone that "Sync Storefront"
keeps in step (commit, fast-forward from the remote, upload, publish;
`storefrontSyncService.ts`). A headless project has only the local clone: creation clones the
source straight onto the computer (`componentInstallation.ts`, by release tag or branch), and
nothing ever uploads it. So a headless project has a source (`skukla/citisignal-nextjs` for
CitiSignal, a colleague's repository for an added demo) but no repository of its own.

What that costs today, each verified in the code on 2026-09-14/15:

- **Save as demo package refuses it** (`EDS_ONLY`, `demoPackageHandlers.ts`; decision D27).
  There is no repository to write the description file into or to point a card at.
- **With the copy gone (D33), a colleague who deletes a headless demo takes it away for
  good.** An Edge Delivery SC saves the project as a demo package; a headless SC can only
  upload the clone by hand. The dashboard notice offers them Change source only.
- **The SC's local edits exist on one disk.** Nothing backs them up, and a colleague cannot
  be handed them except by hand.

## What the SC gets (the owner's direction, to be designed)

Mirror Edge Delivery:

| | Edge Delivery today | Headless, aligned |
|---|---|---|
| Repository in the SC's account | created at project creation | created at project creation |
| Local copy | clone of that repository | clone of that repository, still run locally |
| Local edits reach GitHub | Sync Storefront | a Sync that commits and uploads, no publish step |
| Reset | rewrites the repository from the source | rewrites the repository, then refreshes the clone |
| Save as demo package | works | works |
| Delete project | offers to delete the repository | offers to delete the repository |

## Research first (before a plan)

- **Creation.** Does headless creation need a GitHub sign-in today? (Probably not, because our
  source is public; not checked.) Creating a repository per project is a cloud write, so it is
  confirmed at creation the way Edge Delivery's is. Reuse `createRepoFromSource`
  (`storefrontSetupPhase1.ts`) or say why it does not fit.
- **Updates.** Headless clones by release tag and updates through the component updater;
  Edge Delivery merges the template into the repository (`templateSyncService`, fork sync).
  Which one a headless repository should use, and what happens to local unpushed edits.
- **Reset.** Rewrite the repository then re-clone, or reset the clone and upload. What an SC's
  uncommitted local edits get (the hash-and-skip rule, never-overwrite principle 2).
- **Existing headless projects** (principle 3) have no repository. The path that gives them
  one: an offer on the first Sync, on Save as demo package, or on reset.
- **Reversibility** (principle 1): project deletion's cleanup must learn the headless
  repository; nothing else about deleting a project should change.
- **The agent surface**: `create_project`, `reset_project`, sync and save-as-package tools
  gain the same behaviour, or say why not.
- **Whether the running storefront should read from anywhere but the local disk.** Owner's
  framing: it stays deployed locally; only the codebase is kept in a repository.

## What this unblocks

- Save as demo package for headless projects (drop `EDS_ONLY`), and the dashboard notice's
  second button for them.
- [[EDS-13b]]'s share for headless, which [[EDS-13e]] was filed for.

## Decisions (owner, 2026-09-15)

Research: `.rptc/research/headless-storefront-repository/research.md` (decisions table there).
Plan: `.rptc/plans/headless-storefront-repository/`.

- Reuse the Edge Delivery wizard flow; the repository is created during Create Project.
- Public; the SC's personal account.
- One workflow for both storefront kinds: updates, Sync, reset and deletion consolidate onto the
  Edge Delivery paths rather than running beside them.
- Reset warns about unsaved local edits ("Sync first" or "Discard and reset"), only when there
  is something to lose; Edge Delivery reset does the same and refreshes the local clone, and
  Edit asks before it re-clones.
- Existing headless projects (revised): nothing special. One created before this feature keeps
  running; Reset, Sync and Save as demo package on it say "This project was created before
  headless projects had a GitHub repository. Create a new project to use this." Reset never
  creates a repository.
- A headless SC can pick an existing repository, with "Reset to <demo>", as Edge Delivery allows.
- A failed Create Project keeps the repository it made; a retry reuses it.
- `reset_eds_project` becomes `reset_project`; headless reset stops re-cloning the mesh and apps.
- Binary files, the recorded reset commit and conflict-safe template updates shipped on develop
  (2026-09-15), so updates are no longer blocked.
