# Plan: Node versions in one place (PR-1a)

**Item:** [[PR-1a]] (child of [[PR-1]]). **Research:**
`.rptc/research/node-version-management/research.md`. **Status:** planned 2026-10-07,
awaiting the owner's go.

## Goal

One declared Node version per thing that needs Node; one module that answers "which Node runs
this"; one way to run a command on it; the prerequisites screen reading the same answer; and
existing machines and projects moved over without anything being uninstalled.

## Decisions this plan carries out (owner, 2026-10-07)

1. Adobe's CLI runs on one Node, 24, for every call, mesh included.
2. The data ingestion tool moves to 24.
3. Prerequisites prepare only what a project has chosen; later choices are ensured at the door.

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
| 2 | Ensure a Node AND the Adobe CLI under it, in one call | no (local installs) |
| 3 | Every caller asks the register; "auto", the directory scan and the fallback literals go | no |
| 4 | One runner and one validator | no |
| 5 | Prerequisites read the register | no |
| 6 | One recorded version per installed component; update moves it | no |
| 7 | Docs, skills, and the backlog | no |
| 8 | Live verification on the owner's machine | yes, with the owner's OK |

Each step is a commit with the gate green. Steps 1 to 4 change no behaviour a user sees except
which Node runs a command; step 5 changes the prerequisites screen; step 6 changes update.

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
for the register); the extension-owned Adobe CLI (`.rptc/research/extension-owned-toolchain/`),
which this plan makes easier but does not do.

## Undo

Every step is a commit and nothing uninstalls a Node or a global package. Reverting a declared
version back is one value in one catalog.
