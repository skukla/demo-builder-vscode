---
id: PR-1a
kind: feature
area: prerequisites
parent: PR-1
needs: []
value: med
status: active
---

# Node versions in one place: one register, one resolver, one runner

Filed 2026-10-07 from the owner, after AI-13: Node versions for the extension, the
prerequisites screen, each integration and the AI tools should be managed in a single place.

Research: `.rptc/research/node-version-management/research.md` (inventory at `8c4f266bf`).

## In one paragraph

Node versions are declared in four catalogs plus hardcoded copies and five fallback "20"s,
and turned into a running Node four different ways. The prerequisites screen sees only part
of it (never integrations or the AI tools), and the Adobe CLI runs on different Node for the
same job depending on the caller. The proposal: every catalog entry declares `nodeVersion`
(the Adobe CLI included); one module answers "which Node runs this thing" and "which Nodes
does this project need"; every command runs through `CommandExecutor`'s
`fnm exec --using=N`; the prerequisites screen (PR-1's project tier) reads the same
register; "ensure at the door" for later choices calls it too.

## Decided (owner, 2026-10-07)

1. **Adobe's CLI runs on one Node, 24, for every call**, mesh included. Grounds: aio-cli
   11.1.4 needs Node >=20 and its app plugin >=20.17; the api-mesh plugin accepts >=18; Node 20
   reached end of life 2026-04-30 and Node 24 is supported to 2028-04-30. Needs one live mesh
   deploy on 24 before the switch.
2. **The data ingestion tool: waits on [[DI-4]].** Step 0 found it unreachable (nothing calls
   it) and its data source gone; it installs and starts on Node 24. Whether it is deleted or
   revived is DI-4's question (has the Data Installer superseded it for ACO). PR-1a does not
   touch it; if it survives, it declares 24 like everything else.
3. **Prerequisites prepare only what a project has chosen.** Later choices keep "ensure at
   the door".
4. **Demo Builder keeps its own Node store** (`~/.demo-builder/node/`, fnm's `FNM_DIR`): all of
   it is Demo Builder's, so removal is always safe and the user's fnm is never touched. Replaces
   PR-1 D13/D15 ("never uninstall") for Node. fnm records what is installed, not who installed
   it (checked 2026-10-07), which is why a separate store and not a ledger.
5. **Earlier releases' versions are removed once from the shared fnm**: every version of a major
   Demo Builder ever required (18, 20, 22, 24, from git history), ticked by default in one
   confirmation; the user's fnm default listed but not ticked. The Adobe CLI under a version goes
   with it. (Early releases ran `fnm default` for a week in September 2025, `7f27cc83a`, so a
   default of 20 may be Demo Builder's too.)

## Migration

In the plan's overview (`.rptc/plans/node-versions-in-one-place/overview.md`, "Migration of an
existing installation"): Node 24 and the Adobe CLI arrive in the store at first need; installed
components run unchanged (they were built on 24); the AI bundle is rewritten to the store by the
sweep; the shared fnm is cleaned once (step 8); the store is deleted on uninstall.

## Related

[[AB-3]] (integration `nodeVersion`, the mechanism to generalise), [[AI-13]] (the AI tools,
already on it), [[AB-22]] (read `engines` / `.nvmrc` from an imported repo, a later source for
the register), [[PL-36]] (an untested Node-version sort in the prerequisites installer).

## Shipped so far

- 2026-10-07  2026-10-07 Planned: .rptc/plans/node-versions-in-one-place/ (steps 0-8). Found while planning: getMeshNodeVersion and getInfrastructureNodeVersion look the extension up as adobe-demo-team.adobe-demo-builder (it is skukla.adobe-demo-builder), so mesh always falls back to a hardcoded 20; step 1 removes both.
- 2026-10-07  2026-10-07 Step 0 run. MESH PASSED on Node 24 from a separate fnm store (FNM_DIR): aio-cli 11.1.4 + api-mesh 5.7.3 installed with no EBADENGINE; a minimal mesh created in a throwaway workspace (zzNode24Mesh), provisioned and answered a query; mesh and workspace then deleted. Adobe sign-in carried over to the store's aio (it reads ~/.config/aio). INGESTION: the tool installs and starts on Node 24, but it is DEAD CODE: ToolManager is built only for CleanupService.cleanupBackendData, which nothing turns on (no caller sets cleanupBackendData or an aco/commerce backendType); its data repo skukla/vertical-data-citisignal is gone (now PMET-public, private) and no branch has the definitions/project.json layout the tool reads. Recommendation: delete ToolManager, the backend-cleanup branch and the components.json tools entry instead of moving it to 24. NEW FINDINGS for step 2: npm 11.19 (Node 24.21) skips package install scripts by default (lmdb, @parcel/watcher, @swc/core, tree-sitter under aio; @apollo/protobufjs under the mesh plugin) - the mesh still worked, but App Builder builds must be tested before relying on it; and the api-mesh plugin echoes the SAVED aio workspace ('Select workspace: JustriteERP') while acting on the AIO_CONSOLE_WORKSPACE_ID env, a misleading line to keep out of any user message.
- 2026-10-07  refactor(node): every caller asks the register for its Node version (`249c9b56e`)
- 2026-10-07  feat(node): Demo Builder's own Node store, and ensure a Node with the Adobe CLI under it (PR-1a step 2) (`e500a7f00`)
- 2026-10-07  feat(node): the register of Node versions (PR-1a step 1) (`4050402eb`)
- 2026-10-07  docs(backlog): PR-1a step 0 results: mesh passes on Node 24; ingestion tool is dead code (`fec28eaf5`)
- 2026-10-07  docs(plans): PR-1a keeps its own Node store and removes what earlier releases installed (`c4839d6b6`)
- 2026-10-07  docs(plans): Node versions in one place, steps 0-8 (PR-1a) (`04b1c85dc`)
- 2026-10-07  docs(backlog): PR-1a records the three Node decisions and the migration (`a1bf84e48`)
- 2026-10-07  docs(research): Node versions in one place; filed as PR-1a under the prerequisites reframe (`3df62804f`)
- 2026-10-07  refactor(node): one runner form, one reader of what is installed (`f91d2ea11`)
- 2026-10-07  refactor(prerequisites): one Node set for the Adobe CLI and its plugins (`dbfc15806`)
- 2026-10-07  fix(updates): record the Node a component was just updated onto (`f023df873`)
- 2026-10-07  refactor(components): stop writing .node-version into components (`4ab31fb4b`)
- 2026-10-07  2026-10-07 Owner chose to read Node versions from each component's own engines range instead of hand-kept catalog numbers. Verified live on Node 24 from the store: headless-commerce-mesh and commerce-eds-mesh deployed and answered (throwaway workspace zzNode24Mesh2, deleted), citisignal-nextjs served its home page. Ranges fixed in the repos: headless-commerce-mesh >=20 (f35b082), commerce-eds-mesh >=20 (596d916), citisignal-nextjs >=24 (6b26bbc). Probe now resolves one Node, 24.21.0. Finding: aio plugins install per user, not per Node.
- 2026-10-07  feat(node): resolve Demo Builder's Node from each component's own range (`3ab435741`)
- 2026-10-07  docs(plans): PR-1a owner approves preparing a new Node after an update (`a768b8ec1`)
- 2026-10-07  docs(plans): PR-1a every Node event mapped to an existing surface (`f24ff1ebc`)
- 2026-10-07  docs(plans): PR-1a cleanup rules and what the SC sees (`51d696af6`)
- 2026-10-07  docs(plans): PR-1a replanned around component-declared Node ranges (`996089e26`)
- 2026-10-07  docs(backlog): PR-1a live verification of component-declared Node ranges (`bd9c1a6ed`)
- 2026-10-07  docs(research): component-declared Node ranges verified live on Node 24 (`d1a43cbc5`)
- 2026-10-07  docs(research): read Node versions from each component, keep none in Demo Builder (`4215d3333`)
- 2026-10-07  feat(node): Demo Builder's Node comes from the generated file; catalog numbers removed (`d31b7c549`)
- 2026-10-07  fix(app-builder): an integration installs on the same Node it deploys on (`42ceda860`)
- 2026-10-07  feat(app-builder): an SC's own integration repo gets the Node its range needs (`cbdd5c8ed`)
- 2026-10-07  feat(node): a release that moves the Node moves installed components with it (`141adb676`)
- 2026-10-07  docs(plans): PR-1a step 9 moves components at the update, not at Start (`f50d8adb3`)
- 2026-10-07  fix(node): the Node sweep joins the activation upkeep chain (`a056030aa`)
- 2026-10-07  docs(plans): PR-1a record matches the code after the audit (`5a45f4405`)
- 2026-10-07  docs(node): comments and docs say what the code now does (`c200271f5`)
- 2026-10-07  refactor(node): the repo's words, not the session's (`6082ef9cd`)
- 2026-10-07  refactor(node): one of each, as the audit found them (`ac91a9db1`)
- 2026-10-07  refactor(app-builder): read a custom integration's package.json through the house readers (`911c948af`)
- 2026-10-07  refactor(node): one definition of installing the Adobe CLI, one answer to "is it installed" (`1351d0fc0`)
- 2026-10-07  refactor(node): Demo Builder's Node lives in core; the setter is gone (`745adb317`)
- 2026-10-07  fix(node): the SC reads plain stage names and sentences; fnm's own words go to the log (`f0c7d7cb8`)
- 2026-10-07  fix(ai): the AI tools launch from Demo Builder's Node folder (`976f54664`)
- 2026-10-07  refactor(node): close the re-audit's findings (`39f310ff6`)
- 2026-10-08  refactor(dashboard): project panel pushes get their own module, ending the last three import cycles (`df44020fe`)
- 2026-10-08  refactor(core): move getMeshEndpointUrl beside the mesh state it reads, ending the typeGuards cycle (`2fdd83acc`)
- 2026-10-08  refactor(app-builder): split appBuilderComponentRunner into add, redeploy and remove runs (`04d373365`)
