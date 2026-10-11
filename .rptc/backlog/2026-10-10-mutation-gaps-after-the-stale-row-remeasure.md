---
id: PL-70
kind: chore
area: platform
needs: []
value: med
status: active
---

# Mutation gaps after the stale row remeasure

Filed 2026-10-10, the morning after the overnight re-measure of the 405 stale mutation
baseline rows (`7fb1dcc8e`, logged on PL-69).

That re-measure found **754 open gaps across 121 modules**, where the baseline had read 34
across 3. An open gap is a decision in the code that no test would catch if it were wrong.
They are not new debt: the old rows had been recorded before their modules changed and sat
above the truth.

The owner asked "Why don't we do the gaps now?" and approved working them on
`integration/2026-10-10`, one commit per module, as the PL-69 sittings did.

## How it is worked

The repo's own procedure: `node scripts/mutationQueue.mjs` gives the order (updates, auth,
project state, reset, lifecycle, prerequisites and project creation first, most gaps first
inside a group). Per module: measure it ALONE, read the worklist, then for each surviving
or uncovered mutant write a test that pins the decision, record an equivalent in
`scripts/mutation-equivalents.ledger.json` with its reason, or delete the branch if it is
dead. `scripts/overnight/BURNDOWN.md` and the `mutation-test-pilot` skill carry the rules.

A module is done when no decision is unpinned, not when its score is high.

## Three things the re-measure could not measure

- `appBuilderComponentRunner.ts`: declarations only since the EDS-8 split, so there is
  nothing to mutate. Its row was a leftover; the code lives in ten split files.
- `storefrontSetupPhase1.ts`: its suite failed under the mutation runner only.
- `fieldValidation.ts`: the run was interrupted.

## Shipped so far
- 2026-10-10  chore(mutation): a measurement has a size limit and a time limit, and a run can be asked how far along it is (`2fa316cdd`)
- 2026-10-10  chore(mutation): restart each Stryker test runner after 50 mutant runs (`e9f7a81e8`)
- 2026-10-10  test(eds): the phase 1 App gate suite stops sleeping, so the module can be measured (`5f3229834`)
- 2026-10-10  chore(mutation): the focus tool adds the importing suites where a run left mutants uncovered (`fa2ea4869`)
- 2026-10-10  docs(backlog): AI-71 and PL-71, two things the MUT-02 batch found and did not fix (`6fdd5af55`)
- 2026-10-10  test(app-builder): what a successful app deploy is recorded as is tested directly (`4c0e4580f`)
- 2026-10-10  refactor(sidebar): the back message is removed and the handshake is tested (`f272563d2`)
- 2026-10-10  test(ai): an agent's project delete is tested by what it asks the cloud step to do (`9328548e5`)
- 2026-10-10  test(eds): where a broken link sits, and who a stale patch blames, are tested (`477644f50`)
- 2026-10-10  test(core): a pasted site address and the git name and ref gates are tested at their edges (`cb3bbe0cf`)
- 2026-10-10  test(mesh): the answering suite loads its shared setup before anything else (`e6aa8b204`)
- 2026-10-10  test(mesh): the two mesh endpoint suites share one setup file (`640ff13db`)
- 2026-10-10  test(dashboard): a destination change run from a screen is tested by what it pushes (`b77e6fde1`)
- 2026-10-10  test(mesh): asking a mesh address whether it answers is tested for the first time (`2e9719bb7`)
- 2026-10-10  test(app-builder): the subscribe's optional observers and the entries list are tested exactly (`c0bd73259`)
- 2026-10-10  test(ai): what a project file's seed adds to an agent creation is tested from the arguments (`0fbc7deb8`)
- 2026-10-10  test(dashboard): the integrations grid's own decisions are each held by a test (`36d29c34e`)
- 2026-10-10  chore(overnight): run the redundancy sweep only when the burn-down is done (`1c9b37b31`)
- 2026-10-10  chore(overnight): run 1 queue — 40 modules, regenerated from the baseline (`7fec4912e`)
- 2026-10-10  test(mesh): the two deploy handler suites share one setup, and build projects with the builder (`644b35eb4`)
- 2026-10-10  test(app-builder): a hand-edited app.config declares nothing instead of throwing (`4a1e33146`)
- 2026-10-10  test(mesh): deploying the mesh from a screen's button is tested for the first time (`9609ebd15`)
- 2026-10-10  test(ai): each of the twelve named agent notifications is tested from the argument that names it (`068b53080`)
- 2026-10-10  test(app-builder): a workspace download with half a credential answers "none", not a crash (`b9ad125fb`)
- 2026-10-10  test(dashboard): the mutation pilot selects the card model's new suite (`7bcca7fb7`)
- 2026-10-10  test(dashboard): a card that is not deployed offers nothing that needs a running app (`09257cfba`)
- 2026-10-10  test(extension): what activation shows the SC after moving components onto Demo Builder's Node (`11ee09081`)
- 2026-10-10  test(ai): deleting an Adobe workspace through the agent is tested for the first time (`05e592c77`)
- 2026-10-10  refactor(state): forgetting a list's view choice is a plain assignment (`ccafeb814`)
- 2026-10-10  test(project-creation): a progress line that arrives before any stage is dropped, not shown (`6326eb7a0`)
- 2026-10-10  refactor(project-creation): entering an area no longer guards against a step list that cannot be empty (`766e130ec`)
- 2026-10-10  test(ai-bundle): a server not started with node keeps its own launch line (`45ce46922`)
- 2026-10-10  test(project-creation): the content setup hands back the copy's broken links (`4b02d374b`)
- 2026-10-10  test(ai-bundle): record why the node-only launch guard cannot be tested today (`19bd5f8d5`)
- 2026-10-10  test(ai-bundle): a global MCP repair writes the node binary it was handed (`e9025c374`)
- 2026-10-10  test(ai-bundle): the MCP tools install hands the Node helper a debug sink it can call (`1af05b144`)
- 2026-10-10  test(project-creation): a creation that rejects with no value still reports a failure (`fa6fa6206`)
- 2026-10-10  test(state): the demo field's manifest guard is recorded beside its four identical neighbours (`a4682248e`)
- 2026-10-10  test(auth): a sign-in the browser gave up on counts only when a valid token is really there (`f6741276e`)
- 2026-10-10  refactor(updates): an update writes to the component it already holds, not a second lookup (`14342e5cd`)
- 2026-10-10  test(project-creation): a headless demo reads as Headless in the summary, with no empty-site note (`ce1fd904d`)
- 2026-10-10  test(project-creation): an enable failure with no reason still names what could not be done (`38926c6f1`)
- 2026-10-10  test(project-creation): the home git-sync suite counts for the module it runs, and hook entries are pinned as commands (`b9136260c`)
- 2026-10-10  test(project-creation): a pair name left blank falls back to the catalog name (`172898024`)
- 2026-10-10  test(auth): only a Console 504 that says it timed out is called Adobe's side (`51d634222`)
- 2026-10-10  docs(backlog): PL-72, and two more ways the widen fails on PL-71 (`4593c7161`)
- 2026-10-10  test(ai): the descriptor rows' failure flag is tested under the module's name (`885ef33b0`)
- 2026-10-10  test(ai): a dismissed hand-back opens nothing, and phase lines keep their counter (`e3b5ea821`)
- 2026-10-10  test(ai): an unknown component declares no env-var keys (`1b58ffe90`)
- 2026-10-10  test(ai): the action tools' input guards are tested by parsing them (`ac0a3312d`)
- 2026-10-10  test(dashboard): what the install handlers hand the installer is tested (`ca4daf0f6`)
- 2026-10-10  docs(backlog): PL-70 records the commits that named it (`4ca8d1ff3`)
- 2026-10-10  test(ai): the two toolDescriptors suites share one fake server (`85b18d240`)
- 2026-10-10  docs(backlog): PL-70 records the commits that named it (`df63b912e`)
- 2026-10-10  test(ai): the content-access tools refuse before touching DA.live, and a repair that worked is not a hand-back (`ad76bc37b`)
- 2026-10-10  test(eds): the storefront setup step shows a failed run, and survives the wizard changing under it (`a7bc19be0`)
- 2026-10-10  test(eds): the block library's suites are filed under its name, and an empty template asks DA.live for nothing (`9984356f9`)
- 2026-10-10  test(eds): what storefront setup hands its phases, and tells the UI on a refused sign-in, is tested (`a0621225e`)
- 2026-10-10  test(app-builder): which workspace and which Commerce profile a subscribe targets is tested (`526ae0b93`)
- 2026-10-10  Merge branch 'chore/loop-pause-skips-redundancy-sweep' into integration/2026-10-11 (`cc1fe2d1d`)
- 2026-10-10  test(projects-dashboard): the wizard seed's refusal path is driven (`654d607b7`)
- 2026-10-10  test(mesh): deployMeshHeadless's status telegraph and progress forwarding are driven (`3e3c7da9c`)
- 2026-10-10  test(eds): the staleness detector's object-only guard and unnamed backend are driven (`0a87eb952`)
- 2026-10-10  test(eds): helixService's published-paths read and key token getter are driven (`39b7ba259`)
- 2026-10-10  test(eds): a finished storefront setup hands back the broken links it found (`616a3307f`)
- 2026-10-10  test(eds): a definite "not installed" is never verified by a code publish (`9c5e567aa`)
- 2026-10-10  test(dashboard): record the snapshot effect's dependency list as an equivalent (`680e71eda`)
- 2026-10-10  test(dashboard): record the signed-out flag's starting value as an equivalent (`87557b200`)
- 2026-10-10  test(dashboard): the flyout's setup link opens the guide for the integration on screen (`876b5d7e8`)
- 2026-10-10  test(dashboard): a tile's status goes inline only on a card that has a word for it (`6bcd4278a`)
- 2026-10-10  test(dashboard): a prompt search of only spaces keeps the New prompt card (`37f43dc15`)
- 2026-10-10  test(ai): record the read-only classifier's no-definition hop as an equivalent (`8396d2040`)
- 2026-10-10  test(ai): record run_commerce_query's third args guard as an equivalent (`946a2db05`)
- 2026-10-10  test(core-ui): nothing selected hands SearchableList an empty selection (`1a975d3fa`)
- 2026-10-10  refactor(ai): drop a default on githubVsCodeSessionStatus that no caller used (`44c6781e0`)
- 2026-10-10  test(ai): apply_updates forwards the pair update under the call's own context (`98efd05e1`)
- 2026-10-10  test(validation): record the identifier normaliser's regex mutant as an equivalent (`5f5e7b623`)
- 2026-10-10  test(shell): record the rate limiter's second erased-default mutant as an equivalent (`f652c60b5`)
- 2026-10-10  test(shell): resetting the session forgets the remembered fnm lookup (`b8d11f81f`)
- 2026-10-10  test(commands): the GitHub sign-in offer drops the name when the valid token carries no user (`2f1bd22c7`)
- 2026-10-10  test(eds): record the two remaining empty-dependency mutants on useGitHubAuth as equivalents (`3b1e0a5dc`)
- 2026-10-10  test(eds): a setting change re-applies cleanly when no dashboard callback is registered (`b547a13f2`)
- 2026-10-10  test(eds): the GitHub App gate defers only an undetermined inner 400, and the install dialog gets its payload (`878ecd48d`)
- 2026-10-10  test(core-ui): a custom count line replaces the built one, and gives way while filtering (`d8124cd17`)
- 2026-10-10  test(dashboard): the demo-source notice shows only for a warning that carries a sentence (`e32890433`)
- 2026-10-10  test(dashboard): Manage APIs shows the subscribe's own progress while applying, and starts each apply as a new run (`d72dcdc24`)
- 2026-10-10  test(dashboard): the dashboard names the demo card from the same repository and opens that project's authoring URL (`1a779440a`)
- 2026-10-10  test(app-builder): a lifecycle attempt body that is null, or has no status, answers undefined (`2d5b3439b`)
- 2026-10-10  test(app-builder): the subscriber adapter forwards the subscribed-services read and the credential-id read (`596e050ce`)
- 2026-10-10  refactor(ai): remove five optional chains on tool args that no call could reach (`abef2147e`)
- 2026-10-10  refactor(shell): remove two clauses that were never true and the default that only fed them (`032872862`)
- 2026-10-10  refactor(communication): remove the enableLogging option nothing ever turned off (`a45869a32`)
- 2026-10-10  test(commands): refresh block library hands pipeline messages to the notification and answers when no project is loaded (`773a310b8`)
- 2026-10-10  test(diagnostics): an open project with no EDS storefront reads no storefront report (`987064bcc`)
- 2026-10-10  test(mesh): a republish that answers a failure is reported with its reason, and one that lands adds no key (`571b3ae23`)
- 2026-10-10  test(dashboard): the integrations tile reports a stopped removal when nothing else on it is rankable (`5c6f52d4b`)
- 2026-10-10  chore(overnight): the loop starts its own resource guard (`f05162268`)
