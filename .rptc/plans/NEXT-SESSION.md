# Next session — start here

Written 2026-08-03, end of session two. `develop` has 12+ unpushed commits, all green
(jest 927 suites / ~11778 tests, tsc, whole-repo eslint, build).

**The previous handoff is fully discharged** — its live bug, both host-contract steps, and the
standing MESH ERROR are closed, and the mesh now deploys green in the running extension.

## Start with this

**`per-integration-api-attribution` steps 04–06** — the feature work, parked for three
sessions now.

Before 04: **step 03 has never been verified against live Adobe.** Confirm `componentApiPicks`
lands in a real manifest and that a mesh redeploy leaves Developer Console subscriptions
unchanged. 04 builds on it.

## Then

**`integrations-destination-control/step-01`** — the destination CONTROL. Display shipped; the
control is still blocked on one product question, not on code: after a change, already-deployed
integrations keep pointing at the OLD workspace — copy problem, or stale-state problem?

## What the last two sessions established (do not re-derive)

**An unwrapped `aio` call inherits a stale global; it is not "untargeted."** The extension
stopped writing `aio console where` under Phase 4a. `deployMeshHeadless` was the one deploy path
of four that never wrapped in `withOrgContext`, and it deployed into a DELETED project for two
days while stderr blamed the mesh config. Three siblings always wrapped — check any new `aio`
path against them.

**`aio` puts its diagnosis in stdout and a generic "check your configuration" in stderr.** The
field that looks like the error is the one that misleads. `debug-log-triage` carries this now.

**Guards can be green and prove nothing — four found so far, each for a different reason:**
- a SEND regex using `<[^>]*>` that could not match a nested generic
- assertions against a testid belonging to a mock of a component the screen never renders
- a drift guard reading a fabricated id that was always truthy
- three `verifyAppBuilderComponent` tests that pinned the mechanism faithfully and never asked
  whether the mechanism answered the question on the button

The rule: **run the guard against the broken state before trusting it.**

**Assert what DISPLAYS, not what is sent.** The register split moved deploy steps to
`message`, which the card face never renders — so integration cards sat on a constant
"Deploying…" while the steps went to a closed drawer. Every test passed: they asserted the step
was *sent*. Found by the user asking what the expectation was.

**Agent-driven work must report itself, and "headless" was the wrong goal.** The two deploy
paths disagreed: `deploy_integration` (keyed runner) raised a notification and animated its
card, while `deploy_mesh` ran the core with NO callbacks and was silent for 1–3 minutes. Same
user, same window. Nobody's attention is further from a deploy than when a chat turn started
it. Both mesh callers now share `deployMeshWithFeedback`. `deployAppHeadless` was retired with
its last caller: it never earned the second caller its mesh sibling has, because the MCP tools
were always on the keyed path.

**Notification vs card is a REGISTER split, not a wording fix.** The question was "why do we run
two notification systems at once, and what is each worth?" — the notification is the only
feedback for someone not on the page, so it keeps a coarse title + spinner; the card carries the
steps. Identical wording was the symptom that made it visible, not the reason to change it.

## Unverified in the current build

- The integration card face counting through its deploy steps (the regression above).
- The persisted failure reason in a card's drawer — needs a real failure, and the mesh is green.
- This session's UI pass: source line moved to the flyout, flyout bar → kebab, Redeploy in the
  kebab, destination in the header crumb, `Integrations…` in the project kebab.
- An AGENT-triggered `deploy_mesh` raising the notification and animating the mesh card. Ask
  Claude Code to deploy the mesh and watch the window.
- The notification's QUIET case: a palette-launched mesh deploy with the Integrations tab
  closed. Title + spinner for 1–3 minutes is the accepted trade-off; phases still reach the User
  Logs. If too quiet, give the notification its own 3–4 coarse phases — do NOT restore the mirror.

## Known trade-off, recorded not forgotten

The header crumb reads `Integrations  demo-builder-test · Kukla Mesh · Stage`, which makes the
local project name and the remote Adobe destination peers in one dot-separated run. Chosen
deliberately; the labelled alternative is `PageHeader`'s `description` slot, one prop away. See
`formatHeaderSubtitle`.

## Housekeeping

Nothing pushed, nothing merged to `master`, no release cut. Three slow suites
(`stopDemo.process`, `syncStorefront`, `configSyncService`) take ~280s EACH and will time out if
two jest runs overlap — they pass in isolation. Do not run two full suites at once.
