# Every component ships as a semantic-version release

Item: PL-89. Owner, 2026-11-02: "Every component, including storefronts that we offer, should move to the same
consistent, semantic versioning approach."

Owner, same day: "We can't release .153 until this release process per component is implemented properly and tested and
validated on every repo. An agent should not be able to commit to those repositories without following this process." And:
"This can only apply to repositories that the builder directly owns."

So every stage below comes before beta.153, and the rule covers the `skukla/*` repositories in the table. Adobe's and
colleagues' repositories are out of scope.

## The rule

- **What we own** has a GitHub Release with a semantic version and notes. Merging to `main` ships nothing. Publishing a
  release is the step that reaches SCs.
- **What someone else owns** stays as it is today. Adobe's B2B template stays at the tested commit an `eds-demo-patches`
  release names. The starter kit, `demo-team-blocks`, the `isle5` library and storefront, and added demos keep following
  their branch, so the branch route stays for them.
- **Adobe's npm tools** already have versions from npm. Nothing changes.

A normal release reaches everyone. A prerelease reaches the beta channel only, for trying something first.

## Where each component stands, measured 2026-11-02

| Component | Owner | Follows today | Releases on GitHub |
|---|---|---|---|
| Extension | Us | Releases | Yes |
| Headless storefront `citisignal-nextjs` | Us | Update: Releases. Install: `main` | 4, all prereleases, 7 commits behind `main` |
| `eds-demo-patches` | Us | Newest release, else `main`. Tag not recorded | 7 |
| Starter, citisignal, bodea storefronts | Adobe's template + our patches | Tested commit | Adobe's template has none |
| buildright storefront | Us | Branch head | None |
| isle5 storefront | Colleague, out of scope | Branch head | None |
| 3 meshes | Us | `main` on develop (unreleased). `stable` tag or Releases in beta.152 | 2, 6 and 1, all prereleases. Up to 18 commits behind `main` |
| `demo-erp`, `commerce-erp-integration`, `app-builder-shell` | Us | `main` | None |
| Starter kit | Adobe, out of scope | `main` | 4, and the newest is tagged `legacy`. `main` is 194 commits past `v3.0.0` |
| Block libraries `bodea-blocks`, `buildright-blocks`, `demo-builder-blocks` | Us | `main` | None |
| Block libraries `demo-team-blocks`, `isle5` | Others, out of scope | `main` | None |
| `demo-inspector-sdk` | Us | `main` | None |
| Bodea brand assets | Us | Branch head, no update check | None |
| A demo an SC adds from a colleague | Colleague, out of scope | Its branch | Not a component we offer |

## A trap to clear first

`UpdateManager.checkAllProjectsForUpdates` looks up a release for every component instance holding a `repoUrl`, whatever
its kind. In beta.152 and on develop that includes App Builder components. Applying that row removes the folder, unpacks
the release archive, and deploys nothing, so the clone loses `.git` and the live app stays as it was. Read from the code,
not run.

So the first release on `demo-erp`, `commerce-erp-integration` or `app-builder-shell` would offer that row to anyone
with them. The starter kit mostly escapes it today: its `main` reads 4.0.0, which is past `v3.0.0`, and `legacy` is not a
version, so neither is offered. A project whose starter kit version reads `unknown` would still get the row. Not run.

The release lookup has to stop at what it can apply before any of these repositories gets a first release. Builds already
installed keep the old behaviour, so the extension release goes first.

## Design

**One reader of releases.** `fetchLatestRelease` and `selectLatestForChannel` become the shared module. Delete the three
competing copies: `fetchLatestReleaseTag` (takes the first entry, unsorted), `resolvePatchRef`, and `getLatestRelease`
(no production caller).

**One recorded field.** A component records the version it is at. Commits stay where a commit is what is being compared:
`deployedCommit` (did the last deploy ship this code) and a library's `commitSha` (removal compares against it).

**Meshes and App Builder components.** Install clones the newest release tag. The check compares that release with the
recorded version. Applying fetches the tag, checks it out and deploys, in one step, which keeps what PL-88 got right: the
live app cannot be left behind. The "clone is at code the last deploy did not ship" signal and the Commerce version
signal stay.

**The ERP pair.** Both repositories already carry a contract version in `contract/erp-contract.json`. The release step
refuses an ERP release whose contract does not match the other repository's newest release. The updater needs no version
logic: it already updates the system first and the integration second.

**Headless storefront.** Install clones the release tag, as the update already reads it. Reset re-clones the same way.

**EDS storefronts.** A storefront's version is the `eds-demo-patches` release it was last merged from. One version across
all thin-layer storefronts, because one release already freezes all their ledgers and tested commits together. The project
records that tag. The check compares versions, so a release that only changes patches now offers an update; today it
offers nothing, because the check compares template commits. Applying is unchanged: a 3-way merge to the release's tested
commit, patches re-applied, and a clash stops and offers Fix with AI. The SC's edits stay theirs. `buildright` gets its own
releases and the same merge.

A recorded version names the base a repository last merged from, not everything in it. The SC's repository is theirs.

**Block libraries, inspector, brand assets.** Ours are read at the newest release, through one lookup (`refOfSource`,
`src/core/releases/componentRelease.ts`). Installing a library stays add-only, and the commit is still recorded, because removal
compares against it. The inspector's update row is removed: nothing ever wrote its record and applying it changed no files, so it
never worked. A storefront gets the newest inspector when it is created or reset. Bodea brand assets take the release of `bodea-source`.

**`buildright-eds`.** Its update check and merge use the newest release, and a reset is pinned to it. Creating a storefront from it
still copies the template's default branch, because GitHub's template copy takes no version. The first update then reconciles it. It is hidden.

**The ingestion tool** has two sources that disagree and nothing calls it. PL-60 already tracks it, and the ACO branch deletes
the old one. Not part of this.

**A release step.** One skill and one script, used for every repository: the tag matches `package.json`, notes are written,
the repository's tests pass, the ERP contract check passes, then `gh release create`. `commerce-eds-mesh` and
`headless-commerce-mesh` show why: their newest tags and `package.json` already disagree.

## Existing projects

Nothing is asked of the SC, and nothing is rewritten on load until the next save.

| A project holds | What happens |
|---|---|
| A clone at or past the release commit | Up to date. Records the version on the next write |
| A clone behind it | Offered the update, then fast-forwarded to the tag |
| A mesh folder with no `.git`, from an old release update | Cloned again at the tag, keeping `.env`. PL-88 left this stuck; this closes it |
| `source.branch: stable` or `main` | Read as "follows releases". The field goes when the last writer does |
| An EDS project with `lastSyncedCommit` and no version | Compared by commit once, as today, then records the tag at its next update |
| A hash or `unknown` as a Headless version | Offered once, as `unknown` is today. A hash is never offered today, so it would be stuck: treat it as `unknown` |
| A project file exported with `source.branch` | Accepted on import |

The `stable` tags stay until no supported build clones them. Older builds use them on a dashboard add.

Project files are read by builds from before and after the change. Both shapes get a test.

## How code stays away from SCs

Owner, 2026-11-02: "anytime code is pushed it should follow the same release process. Code doesn't make it out to SC's for the
extension until we release it, right? The components should follow the same pattern."

So the protection is the updater and the installer reading only releases, as they do for the extension. A push to `main` then reaches
nobody, whoever makes it. No GitHub rulesets, approval steps or agent hooks are needed, and pushing stays as free as it is on the
extension's repository. An earlier draft of this plan had all three.

## Validating on every repository

A first normal release of `demo-erp`, `commerce-erp-integration` or `app-builder-shell` before the extension fix ships would
offer installed builds the row that deletes the clone. So validation uses prereleases named `-alpha.N`, which installed builds
ignore on update: the stable channel reads only normal releases, and the beta channel skips alpha. Only the early-access
channel sees them, and only the owner's account qualifies.

The update check honours this for components: a collaborator on early access gets the highest release of any track, and anyone else
on that channel gets what beta gets. The installer still has to: it has no way to ask who the user is, so on early access it installs
what beta installs. Validating a fresh install needs the check passed in where a `ComponentManager` is built (four places).

One exception: for the three meshes, beta.152's install lookup takes the newest release of any kind on the beta channel. A
new project on that channel during a mesh rehearsal would get the alpha. So each mesh's alpha is removed as soon as it is proved.

Each repository passes all of these before beta.153:

1. A push to `main` with no release is not offered to anyone: the check still reports the last release.
2. The release step refuses a version that disagrees with `package.json`, a version not above the last, empty notes, and failing tests.
3. A dev build on the early-access channel offers the alpha, applies it, and records it: deployed for meshes and App Builder
   components, merged on a throwaway site for storefronts, and installed for libraries and the inspector.
4. The alpha is removed, and the project returns to where it was.

The result is one table, one row per repository: `validation.md`, beside this plan. The dry run is done; the live rows wait for the owner's go.

## Stages

All before beta.153. Develop keeps PL-88's commits until stage 2 replaces them.

1. **The trap, the shared reader, the recorded version.** The release lookup stops at what it can apply. Reader built: `core/releases`.
   The installer's mesh rehearsal exposure is closed for new builds; beta.152 still has it.
2. **Meshes and App Builder components move to releases,** keeping PL-88's one-step deploy, shallow clone and `mesh.json` handling.
3. **Headless and EDS storefronts.**
4. **Our libraries, inspector, brand assets.**
5. **The release step and its skill,** `component-release`, the counterpart of `cut-release`, with the contract check for the ERP
   pair. It takes CI's answer when a repository has one and runs local checks when it does not, so no repository needed new tests.
6. **Validation on every repository,** as above.
7. **Docs:** `component-version-management.md` states the opposite rule today, `src/features/updates/README.md`, and each repository's `CLAUDE.md` or `AGENTS.md`.

**Early access** reaches a collaborator on every path, through one shared lookup set up at activation (`configureReleaseAccess`).

**At the cut:** beta.153 ships, then the first normal release of each repository through the release step, starting with the meshes,
then the ERP pair, then the rest. Then the fallback to a branch for our repositories is deleted: `refOfSource` and the installer read a branch only while a repository has no release, and they cannot yet tell "no release" from "could not ask". Once all have one, a failed lookup must refuse instead.

## Surfaces

- Tools: `check_integration_updates`, `update_integration`, `apply_updates`, `sync_storefront` dispatch to the same handlers.
  Their descriptions state the old model.
- Update rows read "current → new version" everywhere. `matchFresh` matches on row words, so its tests move.
- AI bundle: no change expected. Check before calling it done.

## Decided by the owner, 2026-11-02

- `eds-demo-patches/lkg-gate.yml` keeps publishing its own release each night when its checks pass. It is how tested Adobe template
  commits reach storefronts, and the one route where a release needs no person.
- `buildright-eds` goes through the process now, though it is hidden: "this process should still be followed", and the repository
  will change significantly once the builder reaches 1.x.

## Reversal

A bad release is deleted, which stops new offers, and a fixed release follows. Projects that took it move forward with the
fix. Going back to an earlier version is not offered today on any route. Whether to add it is an open question for the
owner, not part of this.

## Open

