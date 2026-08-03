# Next session — start here

Written 2026-08-03, end of session two. `develop` has 10 unpushed commits, all green
(jest 927 suites / 11770 tests, tsc, whole-repo eslint, build).

**The previous handoff is fully discharged.** Its live bug, both host-contract steps, and
the standing MESH ERROR are closed and verified in the running extension.

## Start with this

**`per-integration-api-attribution` steps 04–06** — the actual feature work, parked across
two sessions now.

Before 04: **step 03 has never been verified against live Adobe.** Confirm `componentApiPicks`
lands in a real manifest, and that a mesh redeploy leaves Developer Console subscriptions
unchanged. 04 builds on that, so verifying first is cheaper than unwinding it.

## Then

`integrations-destination-control/step-01` — the destination CONTROL. Its display half
shipped this session (see the annotation at the top of that file). What remains is blocked
on one product decision, not on code:

> after a change, already-deployed integrations still point at the OLD workspace — is that a
> copy problem or a stale-state problem?

Answer that and the rest is specified.

## What this session established (do not re-derive)

**An unwrapped `aio` call is not "untargeted" — it inherits a stale global.** The extension
stopped writing `aio console where` under Phase 4a, so it holds whatever an earlier session
left. `deployMeshHeadless` was the one deploy path of four that never wrapped in
`withOrgContext`, and it deployed into a DELETED project for two days while stderr blamed
the mesh config. `orgContextEnv.ts` previously claimed unwrapped paths were "safe" — that
comment is corrected. Three siblings (`deployAppHeadless`, `edsResetMeshHelper`,
`projectResetService`) always wrapped; check any new `aio` path against them.

**`aio` puts its real diagnosis in stdout and a generic "check your configuration" in
stderr.** The field that looks like the error is the one that misleads. `debug-log-triage`
now says so, with this failure as its signature row.

**Three guards were green while proving nothing.** Each needed a different fix:
- `webviewHandlerCoverage`'s SEND regex used `<[^>]*>`, which cannot match a NESTED generic
  (`request<HandlerResult<Workspace>>`), so `AdobeEntityFields` read as sending nothing and
  `create-adobe-workspace` sat unregistered. Bounded on parens now.
- `IntegrationsScreen`'s two "destination is not shown" tests asserted a testid belonging to
  a mock of a component the screen never renders.
- `handleSelectWorkspace`'s drift guard read a fabricated project id that was always truthy.

The rule that caught all three: **run the guard against the broken state before trusting it.**

**Reversing a decision means finding the tests that encode it.** Both the destination display
and the notification split reversed deliberate, commented, tested choices. In each case the
old reasoning was recorded and the new reasoning replaced it in the same place.

## Unverified in the current build

Shipped this session, not yet seen working:

- The notification/card register split (`87f2ecbe`) in its QUIET case: a mesh deploy fired
  from the command palette with the Integrations tab closed. Title + spinner for 1–3 minutes
  with no phase detail is the accepted trade-off; phases still reach the User Logs channel.
  If too quiet, give the notification its own 3–4 coarse phases — do NOT restore the mirror.
- The persisted failure reason (`13a4df8d`) surfacing in a card's detail drawer. It needs a
  real failure to show itself, and the mesh now deploys green.

Still carried over, never verified: "Switch IMS Org" on a genuine org mismatch, and the
wizard's Switch IMS Org, which `1c40e226` fixed — it could never have worked before (the
dashboard handler demanded a current project, and there is none mid-wizard).

## Housekeeping

Ten commits are unpushed. Nothing has been merged to `master` and no release has been cut.
