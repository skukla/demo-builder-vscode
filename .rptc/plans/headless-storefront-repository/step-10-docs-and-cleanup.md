# Step 10 — Docs, records, and proof that the headless-only paths are gone

Item: [[EDS-13g]]. Decisions: "nothing is soft-deprecated" (owner, 2026-05-20). Depends on
steps 03-09.

## Goal

Every obsolete headless-only or EDS-only path was deleted in the step that obsoleted it.
This step proves it with one set of greps (each with a control), closes the spine ledger
from step 02, brings the documents that state the old behaviour up to date, and records the
item as done. It adds no behaviour.

## What earlier steps deleted, and the check for each

| Removed | In step | Check (count captured into a variable; expect 0) | Control (expect ≥ 1) |
|---|---|---|---|
| `getTemplateSource` | 02 | `grep -rn 'getTemplateSource' src tests` | `getStorefrontBaseline` |
| `frontendSource`, `resolveFrontendSourceFromPackage` | 03 | `grep -rn 'frontendSource\|resolveFrontendSourceFromPackage' src tests` | `repoBranch` |
| `fromAddedDemo` | 03 | `grep -rn 'fromAddedDemo' src tests` | `createRepoFromSource` |
| `readStorefrontGithubRepo`; `edsBranch` in sync | 04 | `grep -rn 'readStorefrontGithubRepo' src tests`; `grep -rn 'edsBranch' src/features/lifecycle src/mcp/storefrontSyncHandler.ts` | `edsBranch` in `src/mcp/blockAuthoring.ts` |
| `projectResetService.ts`, `handleMeshRedeployment`, `buildAppBuilderDefinitionFromInstance`, `resetEdsProjectWithUI`, `executeEdsReset`, `reset_eds_project` | 05 | `grep -rn 'projectResetService\|handleMeshRedeployment\|buildAppBuilderDefinitionFromInstance\|resetEdsProjectWithUI\|executeEdsReset\|reset_eds_project' src tests` | `resetProjectWithUI` |
| Direct `lastSyncedCommit` writes | 02 | `grep -rn 'metadata.lastSyncedCommit = ' src` | `recordStorefrontRepository` |
| A second Next.js detector | 03 | `grep -rn 'HEADLESS_DEPENDENCY = ' src` equals 1 | `HEADLESS_DEPENDENCY` |
| `isEdsProject` in `resourceCleanupHelpers.ts`, `extractEdsMetadata`, `getLinkedEdsProjects` | 06 | `grep -rn 'extractEdsMetadata\|getLinkedEdsProjects' src tests` and `grep -rn 'export function isEdsProject' src` equals 1 | `extractCleanupTargets` |
| Headless `repoUrl` write in change source | 07 | `grep -n 'repoUrl' src/features/eds/handlers/changeDemoSourceHandler.ts` | `templateOwner` in the same file |
| Template-side `main` in the update apply | 07 | `grep -rn 'template/main\|origin main\|--branch main\|template main' src/features/updates/services` | `templateBranch` |
| `EDS_ONLY`, `NO_STOREFRONT_TO_BUNDLE`, `storefrontHeadless`, `linkHeadless` | 08 | `grep -rn 'EDS_ONLY\|NO_STOREFRONT_TO_BUNDLE\|storefrontHeadless\|linkHeadless' src tests` | `NO_OWN_REPOSITORY` |
| `resolveStorefrontPath` in the AI bundle | 09 | `grep -n 'function resolveStorefrontPath' src/features/project-creation/services/aiBundle/claudeSettingsWriter.ts` | the same name in `src/mcp/projectSecurity.ts` (block tools) |

Run them as one script in the scratchpad that asserts each count and each control, per
CLAUDE.md "Verifying" (no counts through `head`/`tail`/`wc` exit codes; quote globs; zsh
`$pipestatus` if a pipe is needed).

## The spine ledger

`tests/templates/spine-chokepoints.test.ts` "storefront REPOSITORY" (step 02): the ledger of
direct `metadata.githubRepo` readers must now hold only `typeGuards.ts` and the EDS-only
readers listed in the overview. Each step removed its own entries; here the remaining
temporary entries (if any) are removed and the case's comment records the audit date.
`call-path-audit` gains this action in its sweep worklist
(`.claude/skills/call-path-audit/SKILL.md`), so a release-cut audit re-checks it.

## Docs and records

- `CLAUDE.md:156` "Modifying Wizard Steps": `StorefrontStep` (area id `'storefront'`,
  EDS-only…) becomes "any stack with a storefront repository: GitHub + repository; DA.live,
  Code Sync and block libraries for Edge Delivery only". `CLAUDE.md` is loaded into every
  session; check `tests/sop/claude-md-handbook-agreement.test.ts` for a paired handbook line.
- `docs/systems/sharing-a-demo.md`: the "Headless demos" section (steps 03, 08) read end to
  end once more against the shipped behaviour.
- `docs/systems/mcp-tools.md`: regenerated (`scripts/generate-tool-catalog.mjs`) and diffed.
- `docs/systems/mcp-server.md`, `docs/systems/agent-alerts.md`, `docs/systems/project-file-format.md`:
  read against steps 02, 04, 05, 09.
- `src/features/dashboard/README.md`, `src/features/ai/README.md`, `src/features/CLAUDE.md`:
  any "EDS only" statement about Sync, Save as demo package, reset or the hook.
- `docs/CHANGELOG.md`: one consolidated entry for the feature, listing the Edge Delivery
  behaviour changes the owner approved (reset's local-edits guard and clone refresh, Q1;
  Edit's guard, Q2; `reset_eds_project` renamed `reset_project`, Q6; a creation retry reusing
  an unchanged repository, decision A; the conflict reset keeping the description file) and
  the headless ones (a repository from creation; reset no longer re-cloning the mesh, Q7;
  projects created before this feature say the decision-5 sentence and get no storefront
  updates, decision C). The binary-file and recorded-commit fixes shipped on develop and are
  not repeated here.
- `.rptc/research/headless-storefront-repository/research.md` "found on the way": a dated
  status line per finding (#1 and #4 fixed on develop by `43e70398b`; #2 and #3 by
  `b4136c7ac`).
- `.rptc/plans/portable-demos/overview.md:63` (D27, "Share this demo is Edge Delivery only in
  v1") and its record in `.rptc/plans/shareable-demo/overview.md:279-287`: a dated line that
  EDS-13g gives headless projects Save as demo package and the link. (The research could not
  confirm D27's label; it is that row.)
- Backlog, through the `backlog-item` skill's CLI (`.claude/skills/backlog-item/backlog.mjs`),
  never by hand: `EDS-13g` status and a log line naming the commits; `backlog.mjs sync` for the
  README. EDS-14 is not touched here.
- This plan folder moves to `.rptc/complete/headless-storefront-repository/` once shipped
  (`rptc-hygiene-scan` checks it).

## Follow-ups this plan does not do (for the owner to file or drop)

- Rename the wizard's `edsConfig` slice to a kind-neutral name (376 references in 37 files on
  2026-09-15); a mechanical `ask-the-tool` refactor.
- Headless storefronts through the zip import and Export → Send a file (step 08).
- Choosing an existing repository from the agent surface, for either kind (step 03).
- Whether `src/features/eds/services/reset/` should live under `lifecycle/` now that it serves
  both kinds.

## Tests

No new product tests. The scratchpad script above, the spine case, and the full gate.

## Acceptance

| Predicate | Evidence |
|---|---|
| Nothing obsolete remains | the script: every count 0, every control ≥ 1 |
| Ledger closed | spine case green with no temporary entries |
| Docs agree | `tests/sop/cited-identifiers.test.ts` green (it fails on a cited identifier that no longer exists); the regenerated `mcp-tools.md` has no uncommitted diff |
| Records | `backlog.mjs check` green; README span regenerated |
| Gate green | `gate`, pre-push |

## Reversal

Revert the commit; it holds documents and records only.

## After this plan: remove `master` from the CitiSignal headless source

`skukla/citisignal-nextjs` keeps a `master` branch at the commit `main` started from
(2026-09-15), only so released versions that clone `--branch master` keep working. Once no
supported version of the extension names `master` (the first release carrying develop
`8bb5ff448` is the floor), delete that branch on GitHub, with the owner's confirmation. Until
then, commit to `main` only; anything committed to `master` alone reaches only old versions.
