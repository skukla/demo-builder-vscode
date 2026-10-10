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
- 2026-10-10  test(auth): a missing title and the App fallback get the same ending and length rules as any name (`373cf881d`)
- 2026-10-10  test(updates): picked installs and integration pairs reach only their own executor, and picker rows are pinned (`58434624a`)
- 2026-10-10  test(project-creation): a demo's datapack is pre-selected when the catalog arrives after the first frame (`0a2fccdfa`)
- 2026-10-10  test(project-creation): the missing-structure warning shows only on Business Structure, for the current inputs (`8ea905476`)
- 2026-10-10  test(project-creation): the Add card's dimming and the gallery's card class and library keys are pinned (`ad449f569`)
- 2026-10-10  test(project-creation): the executor's demo row, defaults input and EDS-only menu step are pinned (`fbb4dda26`)
- 2026-10-10  test(auth): the callbacks the entity factory hands between services are pinned where they land (`25826abd2`)
- 2026-10-10  chore(sop): the install handler's raw-message exemption follows its line (`8135b8fb7`)
- 2026-10-10  test(prerequisites): the step lines an agent hears during an install are pinned by content (`b0cd72519`)
- 2026-10-10  test(state): stale system links, the older-code check and update clearing are pinned directly (`d1b9934db`)
- 2026-10-10  fix(wizard): naming the ERP while adding the ERP integration keeps the pair together (`2f1c7ea58`)
- 2026-10-10  test(eds): a reset of a repo with no package.json is pinned as carrying no boilerplate (`47cde66b5`)
