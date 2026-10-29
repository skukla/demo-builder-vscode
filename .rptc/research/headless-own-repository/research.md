# Research: should a headless project keep its code in a repository of the SC's own? (EDS-13g)

Researched 2026-10-03 in the `feature/erp-integration` worktree (branch at read time:
`loop/2026-10-04-night3-a`, head `4be2f2567`). Read-only. Another agent was editing code in
the same worktree that night, so line numbers are as read on 2026-10-03 and can move.

**This builds on, and does not repeat, the 2026-09-15 research** at
`.rptc/research/headless-storefront-repository/research.md` (written at `7e061d2ab`). That file
is the deep map of creation, update, reset, sync, deletion and save-as-package code paths.
This file re-checks it against today's code, adds the export/zip option the item now has to
weigh, and gives a recommendation.

## The answer in three sentences

Create the SC's repository at project creation, the way Edge Delivery does, and give existing
headless projects a one-time, confirmed "give this project a repository" offer from the
places that need one (Save as demo package, Export, Sync). Until that ships, the cheap and
safe stop-gap is to let Export's "Send a file" carry a headless storefront by zipping the
local clone through the same ignore rules the zip *import* already applies. The one hard
risk is secrets: a headless clone holds a `.env` with `ADOBE_CATALOG_API_KEY`, so every path
that uploads or zips the clone must drop `.env*` itself, not trust the clone's `.gitignore`.

## What changed since the 2026-09-15 research

All four defects it found are fixed in today's code:

| 2026-09-15 finding | Today |
|---|---|
| Component update deleted every folder of the component (shell glob) | Fixed. Unzip only; the root folder is flattened in Node (`componentUpdater.ts:428-433`, comment cites `archiveRoot.ts`) |
| Change source did not move a headless reset's clone source | Fixed. `repointInstanceMetadata` rewrites the frontend instance's `repoUrl`/`branch` (`changeDemoSourceHandler.ts:39-44`) |
| `create_project` told the agent a headless project can be synced | Fixed. The headless answer no longer names `sync_storefront` (`createProjectTool.ts:379-380`); the EDS answer still does (`:554`), correctly |
| Home Chat's auto-sync hook pushed any repo with an `origin`, including a headless clone's source | Fixed. The hook now pushes only under the manifest's `eds-storefront` path; "no storefront in it, means no push" (`claudeSettingsWriter.ts:396-407`) |

Also new since then:

- **`reset_project`** (renamed from `reset_eds_project` on 2026-10-03) now resets a headless
  project too, by deleting and re-installing its components (`resetProjectTool.ts:1-25`,
  `:142-175`). It is confirm-gated and says plainly it has no undo. A headless reset still
  discards every local edit to the clone (re-clone from `repoUrl`,
  `projectResetService.ts:186-191`).
- **Export's "Send a file"** exists (built 2026-09-13). Its storefront part is the SC's
  repository downloaded from GitHub as an archive (`exportDemoBundleHandler.ts:108-113`), so it
  refuses a headless project: `NO_STOREFRONT_TO_BUNDLE` (`:33`, `:86-87`). The dialog greys the
  part out with "This project has no storefront of its own." (`ExportModal.tsx:48-49, 246-249`).
- **Zip import** of a storefront exists and already filters a folder the way a repository
  would: the zip's own `.gitignore`, plus an always-dropped list (`.git/`, `node_modules/`,
  `.npm-cache/`, `.DS_Store`, `.env`) (`zipStorefrontImport.ts:36-37, 53-99`). It pushes the
  result into a new repository through the Git Tree API (`pushFiles`, `githubTreePush.ts:41`),
  which needs no git history. This is the piece that makes options below cheaper than they
  were on 2026-09-15.
- **CitiSignal's headless source moved to `main`.** `demo-packages.json:224-229` now says
  `branch: "main"`, `shallow: false`. Live read 2026-10-03 (public, unauthenticated):
  `skukla/citisignal-nextjs` has `default_branch: main`, `is_template: false`, `private: false`.
  The 2026-09-15 file's "`master`" is stale on this point.

## What a headless project's code is, and where it lives

- **Location:** `<project>/components/headless`, a `git clone` of the demo's source
  (`componentInstallation.ts:69, 133`). `origin` is the SOURCE (`skukla/citisignal-nextjs`, or a
  colleague's repository for an added demo). `componentInstances.headless.repoUrl` holds the
  source URL and is what reset re-clones from and updates check.
- **Contents:** the Next.js app, plus what the extension writes into it: `.node-version`, and
  a generated `.env` (`envFileGenerator.ts:293-294`; the file is `.env.local` only if the
  component id contains `nextjs`, and the id is `headless`).
- **Secrets in it:** the headless catalog entry's required env vars include
  `ADOBE_CATALOG_API_KEY`, alongside the Commerce URL, environment id and store codes
  (`components.json`, `frontends.headless.configuration.requiredEnvVars`). That key is a
  credential.
- **Ignore file:** CitiSignal's `.gitignore` ignores `.env*` except `.env.example`, `/node_modules`,
  `/.next/` and `.node-version` (live read 2026-10-03). A colleague's repository may not.
- **Not in the clone:** the AI bundle (`AGENTS.md`, `.mcp.json`, skills) is written at the
  project root, not inside the clone; the AGENTS.md storefront section reads only the
  `eds-storefront` instance (`agentsMdSections.ts:196-203`).

## How Edge Delivery gets its repository today (the path to mirror)

- `createRepoFromSource` (`storefrontSetupPhase1.ts:368-406`): a shipped brand is generated
  from its GitHub template; an added demo is read live and either generated (if a template)
  or created empty and reset onto the source through the Git Tree API.
- It is called from the wizard's Create Repository button and from storefront setup phase 1.
  Repos are public by default; namespace is the GitHub personal account unless the DA.live org
  picker names another (see the 2026-09-15 file §1).
- The executor then clones the SC's repository, not the source, and records `githubRepo` on
  the `eds-storefront` instance. Sync Storefront commits with `git add -A`
  (`storefrontSyncService.ts:256`) and pushes to that repository.
- Deletion offers "Delete Repository" for EDS projects only (`projectDeletionService.ts:111-112,
  258-269`; `isEdsProject` = `eds-storefront` key present, `resourceCleanupHelpers.ts:73-78`).

**Fit for headless:** `createRepoFromSource`'s added-demo branch already handles a source that is
not a template (CitiSignal is not one). Its shipped-brand branch calls `createFromTemplate`
without checking, which would fail for CitiSignal. The fix is to always take the "read
`isTemplate` live" path, which means renaming the `fromAddedDemo` flag.

## What sharing, copying and exporting need from a repository

| Door | Needs a repository? | Headless today |
|---|---|---|
| Save as demo package (EDS-13b) | Yes. It writes the description file into the SC's repository and the card points at it | Refused: `EDS_ONLY` (`demoPackageHandlers.ts:47-48, 66-70`) |
| Export, "Send a link" | Yes. The link is the repository | Refused: "no storefront of its own. Send a file instead." (`ExportModal.tsx:49`) |
| Export, "Send a file" | Today yes, only because it downloads the archive from GitHub. A file could be built from disk | Refused: `NO_STOREFRONT_TO_BUNDLE` (`exportDemoBundleHandler.ts:86-87`) |
| Import a bundle / Add from a zip (receiving side) | Creates a repository from the zip | Already reads a headless repository's description file (2026-09-15 §6, `sharedDemoProbe.ts`); the zip path classifies EDS storefronts only (`classifyRepoForStorefront`, not checked further) |
| Copy project (PL-56e) | No. It re-creates from the setup file and re-clones the source | Works, but the copy gets the SOURCE, not the SC's edits |
| Reset | No, but with a repository it could rewrite the repository and keep a record | Re-clones the source; local edits are gone |
| Back-up of local edits | Yes | None. The edits exist on one disk |

So: the link form and Save as demo package need a repository. The file form does not, if it
reads the disk instead of GitHub.

## The options

### A. Create a repository at project creation (the item's direction)

**What changes for the SC:** a headless project asks for GitHub sign-in and a repository name
(a small Storefront area for headless), and creation makes the repository and clones it. A
"Sync" button pushes their edits. Save as demo package, Export link and file, and Delete
Repository all work the same as Edge Delivery.

**Effort:** large. The 2026-09-15 reuse map (`§(a)`) lists about 20 touch points: the wizard
area, `createRepoFromSource`, the clone step, a stack-neutral "own repository" accessor beside
`getEdsRepoParts`, Sync (command, MCP tool, dashboard row) generalised from `eds-storefront`,
an update model (template merge instead of release zipballs), reset (rewrite the repository,
then refresh the clone), deletion's QuickPick, Save as demo package (`describeProject` without
content source or index check), Export, and the agent's `create_project`, `reset_project`,
`sync_storefront`, `save_demo_package`. Rough size: two to three loop nights, similar to the
shareable-demo plan.

**Risks:**
- **Secrets (property 4):** Sync runs `git add -A`. The clone's `.env` holds
  `ADOBE_CATALOG_API_KEY`. CitiSignal ignores `.env*`; a colleague's repository may not, and the
  repository is public by default. Sync must refuse to stage any `.env*` (other than
  `.env.example`) whatever the ignore file says, and the creation step should add `.env*` to
  `.gitignore` if it is missing. The headless reset re-generates `.env`, so the guard has to be
  on every push, not once.
- **Cloud write (property 5):** creating a repository is a cloud write. Do it after the
  Review step's confirmation, not from a button mid-wizard (the EDS button can orphan a
  repository if the SC backs out).
- **Reversibility (property 1):** deletion must learn the headless repository, and a creation
  that fails after the repository exists needs a rollback. EDS has a rollback only for a
  cancelled storefront setup.
- **Updates:** the release-zipball updater removes `.git` and would find no releases on the
  SC's repository, so updates would silently stop. The template merge model fits, but its
  conflict fallback is a full reset that discards edits (property 2), and it hard-codes `main`.

**Existing projects (property 3):** they have no repository and `repoUrl` means "the source".
Keep `repoUrl` meaning the source; record the SC's repository in a NEW field (so reset and
update keep working for old projects); and offer a repository once, confirmed, from Save as
demo package, Export and the first Sync, never automatically. Build the first commit from
the CURRENT clone's files through `pushFiles` (Git Tree API), not `git push`: it needs no
history, so shallow clones work, and the SC's local edits become the first commit. Then point
`origin` at the new repository.

### B. Create a repository only on demand, when the SC shares

**What changes for the SC:** creation is unchanged (no GitHub sign-in for headless). The first
time they press Save as demo package or Export → Send a link, they are asked to make a
repository from their current clone. After that the project behaves like option A.

**Effort:** medium-large. It is option A minus the wizard area and the creation-time clone
change, but it still needs the new field, Sync, deletion, reset and updates to understand a
project that has a repository. Two kinds of headless project (with and without) live side by
side forever, so every headless code path has to branch on it.

**Risks:** the same secrets risk at the moment of the first upload. Less cloud writing
nobody asked for. A project that never shares never gets a backup of its edits.

**Existing projects:** nothing to migrate; they are exactly the "not yet shared" kind.

### C. Never: export a headless project as a zip from disk

**What changes for the SC:** Export → Send a file gains the storefront part for headless: the
clone, filtered, inside the same `<name>-demo-bundle.zip`. The colleague's Add from a zip
creates their own repository (or, for headless, their own clone) from it. No repository on the
SC's side, no Save as demo package, no link.

**Effort:** small. Read the clone from disk, filter it with the zip import's existing ignore
logic (`zipStorefrontImport.ts:53-99`), and hand the files to `buildDemoBundle`, which today
takes a GitHub archive buffer (`demoBundle.ts:29-30`) and would take a file map instead. The
receiving side must learn to classify a headless storefront zip (today it classifies EDS only;
not traced to the end here).

**Risks:** secrets again, and here more directly: the zip lands on the SC's disk and is
emailed or dropped in Slack. The always-dropped list drops `.env` but not `.env.local` or
`.env.production` (`zipStorefrontImport.ts:37`). For this use it must drop `.env*` except
`.env.example`, plus `.node-version` is harmless. No back-up of edits; no link; a colleague's
copy is frozen at the moment of export.

**Existing projects:** work immediately; nothing stored changes.

## Recommendation

**Do C now, then A, and skip B.**

1. **C first (one night, low risk).** It closes the "a headless demo can only be handed over by
   hand" gap for the file form, which is the form the owner made first-class on 2026-09-13. It
   changes nothing stored, so existing projects keep working with no migration. Fix the
   `.env*` gap in the always-dropped list as part of it, since both directions then share it.
2. **A as the real fix (the owner's stated direction in the item).** One model for both stacks
   is simpler than B's two kinds of headless project. New projects get the repository at
   creation; existing ones get the confirmed one-time offer built from the current clone.
3. **Not B.** It carries most of A's cost and adds a permanent fork in every headless path.

The order matters for one reason: A's existing-project offer and C's export both need the same
"files from the clone, filtered for secrets" step. Building it once in C means A reuses it.

## Owner decisions

1. **Order:** ship the zip export (C) before the repository work (A)? Recommended: yes.
2. **Repository at creation for new headless projects (A), or only on demand (B)?**
   Recommended: at creation, as the item says.
3. **Existing headless projects:** a confirmed one-time offer from Save as demo package,
   Export and the first Sync, never automatic, first commit built from the current clone?
   Recommended: yes.
4. **Secrets rule:** every upload or zip of a clone drops `.env*` (except `.env.example`)
   regardless of the project's `.gitignore`, and creation adds `.env*` to `.gitignore` if
   missing? Recommended: yes, and treat it as a gate, not a default.
5. **Public by default**, as Edge Delivery does (a colleague must be able to read it)?
   Recommended: yes, made safe by decision 4.
6. **Update model for a headless repository:** merge from the source (Edge Delivery's template
   model) and, on conflict, stop and report rather than fall back to a full reset?
   Recommended: yes. The 2026-09-15 file §2 has the detail.
7. **Reset with a repository:** if the clone has unpushed edits, say so and offer "Sync first"
   or "Discard and reset", never discard silently? Recommended: yes (property 2).
8. **The running storefront still runs from local disk only**, and the repository is backup
   and sharing? Recommended: yes, as the owner framed it.

## Sources

- Code in the worktree, as cited, read 2026-10-03.
- `.rptc/research/headless-storefront-repository/research.md` (2026-09-15), for the full code
  map not repeated here.
- `.rptc/backlog/2026-09-15-headless-storefront-repository.md` (EDS-13g),
  `.rptc/backlog/2026-09-11-project-portability.md` (PL-56, "Export is the umbrella").
- Public GitHub reads, 2026-10-03: `api.github.com/repos/skukla/citisignal-nextjs` and its
  `.gitignore` on both `main` and `master` (raw.githubusercontent.com); both ignore `.env*`.
