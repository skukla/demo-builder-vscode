# Plan: Node versions in one place (PR-1a)

**Item:** [[PR-1a]] (child of [[PR-1]]). **Research:**
`.rptc/research/node-version-management/research.md`. **Status:** planned 2026-10-07,
awaiting the owner's go.

## Goal

One declared Node version per thing that needs Node; one module that answers "which Node runs
this"; one way to run a command on it; the prerequisites screen reading the same answer; and
existing machines and projects moved over, with what Demo Builder put on the machine removed
once it is no longer needed.

## Decisions this plan carries out (owner, 2026-10-07)

1. Adobe's CLI runs on one Node, 24, for every call, mesh included.
2. The data ingestion tool waits on [[DI-4]] (Data Installer superseded it?). This plan does not
   touch it; if it survives, it declares 24.
3. Prerequisites prepare only what a project has chosen; later choices are ensured at the door.
4. **Demo Builder keeps its own Node store**, `~/.demo-builder/node/`, passed to fnm as
   `FNM_DIR` on every call it makes. Everything in it is Demo Builder's by construction, so
   removing an unneeded version is always safe and the user's own fnm (versions, default,
   terminal) is never touched. Replaces PR-1 D13/D15 ("never uninstall") for Node.
5. **The versions earlier releases put in the user's shared fnm are removed once**, after the
   own store works: every version of a major Demo Builder ever required (18, 20, 22, 24, from
   the catalogs' git history), ticked by default in one confirmation, the fnm default listed
   but NOT ticked. Removing a version removes what was installed under it (the old Adobe CLI).

## A defect the plan removes, found while planning (verified 2026-10-07)

`getMeshNodeVersion()` (`core/utils/meshConfig.ts:64`) and
`EnvironmentSetup.getInfrastructureNodeVersion()` (`core/shell/environmentSetup.ts:218`) look the
extension up as `adobe-demo-team.adobe-demo-builder`. Its id is `skukla.adobe-demo-builder`
(`package.json` publisher + name). `getExtension` returns undefined, so mesh always takes the
hardcoded fallback "20" and the infrastructure lookup always finds nothing. They also read
`src/.../components.json` from the installed extension's folder, a path a packaged build may not
ship. Step 1's register reads the bundled JSON imports instead, so both go.

## Steps

| # | Step | Writes to the cloud? |
|---|---|---|
| 0 | Live checks on Node 24: a mesh deploy, and a data ingestion run (scratch project) | yes, with the owner's OK |
| 1 | The register: `core/node/nodeRequirements.ts` + every catalog declares `nodeVersion` | no |
| 2 | Demo Builder's own Node store, and one call that ensures a Node AND the Adobe CLI under it there | no (local installs) |
| 3 | Every caller asks the register; "auto", the directory scan and the fallback literals go | no |
| 4 | One runner (always with Demo Builder's store) and one validator | no |
| 5 | Prerequisites read the register | no |
| 6 | One recorded version per installed component; update moves it | no |
| 7 | The AI bundle and terminals move to Demo Builder's store | no |
| 8 | Clean up the shared fnm once; remove the own store on uninstall | no (local removals, confirmed) |
| 9 | Docs, skills, and the backlog | no |
| 10 | Live verification on the owner's machine | yes, with the owner's OK |

Each step is a commit with the gate green. Steps 1 to 4 change no behaviour a user sees except
which Node runs a command; step 5 changes the prerequisites screen; step 6 changes update;
step 8 asks the user once.

## Migration of an existing installation

| What | How it moves | Step |
|---|---|---|
| The machine | The first command that needs Node 24 installs it, and the Adobe CLI under it, into Demo Builder's store. One time, a few minutes, said on screen; nothing at start-up. No fnm or offline: stop with the reason, never fall back to the shared fnm | 2 |
| Installed components | Built on Node 24; the store's Node 24 runs them unchanged. `.node-version` holds only a number | 6 |
| The AI bundle (tool launch lines, the demo-builder proxy's `which node`, the settings hook) | Rewritten to the store by the activation sweep (an `AI_CONTEXT_VERSION` bump) | 7 |
| Starting a demo | Switches from the shared fnm to the store | 4, 7 |
| Adobe sign-in | Expected to carry over: aio keeps it in the user's config, not in a Node version (unverified; checked in step 10) | 10 |
| The shared fnm | One confirmation removes the versions Demo Builder used to rely on; the default kept unless ticked | 8 |
| Uninstalling Demo Builder | Its store is deleted | 8 |

## Surfaces to hit (CLAUDE.md "Hit every surface")

- **Config field in three places:** `nodeVersion` gets added to `components.schema.json`, and
  stays in the App Builder and ai-defaults schemas; types in `src/types/components.ts`,
  `appBuilderComponents.ts`, `aiDefaults.ts`. The dead `componentRequirements.nodeVersions` in
  `prerequisites.schema.json` is deleted (PR-1 D9 already wants this).
- **Human and agent surfaces:** the prerequisites screen and the `install_prerequisite` /
  `check_prerequisites` tools both go through `PrerequisitesManager`, so step 5 reaches both.
  Integration adds (dashboard, wizard, agent) share the add door.
- **Mocks:** suites that fake `CommandExecutor` and count calls will see the new ensure step;
  stub `ensureNode` (step 2's module) as AI-13 did, never by counting.
- **Docs:** `docs/architecture/working-directory-and-node-version.md`,
  `docs/systems/prerequisites-system.md`, `src/core/shell/README.md`,
  `src/features/prerequisites/README.md` (its `api-mesh` "declares no requiredFor" is stale).

## Not in this plan

PR-1's welcome panel and tiers; reading `engines` from an imported repo (AB-22, a later source
for the register). The Adobe CLI becomes extension-owned as a side effect (it lives under the
store's Node), but pinning its version and its plugins, the rest of
`.rptc/research/extension-owned-toolchain/`, is not in this plan.

## Undo

Every step is a commit. A declared version is one value in one catalog. Anything removed from
the shared fnm in step 8 comes back with `fnm install <major>` (and the Adobe CLI with the
prerequisites screen); the confirmation lists exactly what goes before anything does.
