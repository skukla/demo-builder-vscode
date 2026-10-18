---
id: AB-80
kind: fix
area: app-builder
needs: []
value: low
status: active
---

# An add into a workspace it just made skips the leftover-code check

Filed 2026-10-17, from release row 3.16 (owner: "Why would adding a new app need
this?").

## What happens

Every app deploy, add and redeploy alike, ends by deleting the Runtime actions the
app no longer declares (`deleteLeftBehindActions` in `appBuilderDeployDispatch.ts`,
AB-33, `030a7ed6f`). It exists because `aio app deploy` never deletes an action an
app stopped declaring: the ERP integration's order column moved on 2026-09-27 and
the old action stayed live until deleted by hand.

For a redeploy that is the point. For an add into a workspace the add itself created
moments earlier there can be nothing left behind, and the step still costs the SC a
wait. Measured on the row 3.16 run (My App, starter kit, new workspace "My App" in
"Kukla Test App"): 10:06:35 to 10:06:51, about 16 seconds (namespace lookup ~4s, then
the package listing), with nothing to find.

The progress line was also wrong for that case: it said "Deleting code the app no
longer declares" before looking. Reworded the same day to "Looking for old code to
remove" (plain words, and within the 40-character line-2 rule).

## Fix (built the same day, owner: "Fix it now")

The add notes when the workspace step MAKES its workspace (`onMaking`, which fires on
making and not on joining) and passes `workspaceJustMade` to `dispatchDeploy`, which
skips `deleteLeftBehindActions`. An ERP pair's system makes the workspace and skips;
its integration joins it and keeps the check.

Originally proposed: skip the check when this add created the app's workspace in the same run
(`ensureComponentWorkspace` → `make` in `componentWorkspace.ts` knows; nothing
carries that to `dispatchDeploy` today). Keep it for:

- redeploys (the reason it exists);
- an add into an EXISTING workspace (chosen at the destination step, or an ERP pair's
  second app), where an earlier copy's code may still be deployed, for example after
  a removal whose own leftover sweep failed.

Pinned in `appBuilderComponentRunner-leftBehindCode.test.ts`: an add into a workspace
it made does not look; one into a workspace it joined still does.

## Shipped so far

- 2026-10-17  docs(walk): record row 3.16, Edit adds and removes an app (`37e6b5ae1`)
- 2026-10-17  fix(app-builder): an add into a workspace it just made skips the leftover check (`98f525c4b`)
