---
id: AB-28
kind: fix
area: eds
needs: []
value: high
status: backlog
---

# The republish inside an add, a deploy or a save asks for the DA.live sign-in, and says when the CDN did not take it

Found 2026-09-24 while checking AB-27 live: the first add of the Commerce integration starter
kit on Bodea finished "done" in 2m 59s, and its storefront republish had pushed config.json
to GitHub while the CDN publish was refused with a 401 — no DA.live session in that window.
Only the Debug Logs said so. The tile went green over a storefront serving the previous
config.json. The owner: "Shouldn't the DA.live credential have surfaced a dialog or modal
for the user to click?"

## Why it was silent

Every storefront the extension sets up carries a site admin role, and with it every Helix
admin call — the code publish included — needs the DA.live session (skill
`eds-publish-and-config`, rule 5). The dashboard's Republish button asked for it
(`ensureDaLiveAuth`). The republish that runs INSIDE another operation did not: the
runner's add and deploy, both mesh-deploy doors, the Configure save's authoring flip, and
the agent's `republish` tool all called `republishStorefrontConfig` straight. Its CDN
publish still carried a comment saying code publishes need only GitHub auth, which stopped
being true when site admin roles arrived. And the service marked the storefront `published`
and advanced its baseline even when the CDN had refused, so the one durable signal — the
Republish tile — said current.

## Which surface, and why (the owner asked)

- **The sign-in ask** reuses `ensureDaLiveAuth`, so it follows the rule the owner set on
  2026-09-20: inside a modal-hosted operation the sign-in form appears in the modal; under an
  agent call it is a VS Code modal (the same shape as the consent dialog); from a plain
  button it is a warning notification with a Sign In button. No fourth surface was invented.
- **The agent's `republish` tool** refuses with `needsAuth: "dalive"` and the sign_in
  instruction, as `sync_content` already does — an agent gets a refusal it can act on,
  never a dialog it cannot click.
- **When the CDN publish still did not land** (declined, or nobody there to answer): a
  warning notification for the SC and `data.warning` for the agent, the pattern removals use
  for their leftovers — AND the storefront stays `stale`, its published baseline untouched,
  so the Republish tile is amber until a republish actually lands. That is the alert that
  outlives the toast.

## What changed

`RepublishParams.ensureDaLiveSession` (optional; every production caller passes it), asked
BEFORE the push; a declined session names itself on `cdnError`
(`NO_DALIVE_SESSION_MESSAGE`); a `cdnError` leaves the storefront `stale`. The runner's
add and deploy return `warnings` from the republish; the dashboard's add, deploy and remove
answer through one `answerWithWarnings`. Pinned in `storefrontRepublishConfig-persist`,
`appBuilderComponentRunner-republishWarning`, the dashboard handler suite and
`storefrontTools`.

## Not done

- Not run live. The next add on a project whose window has no DA.live session is the check:
  the sign-in form should appear in the add's modal, and declining it should end with a
  warning and an amber Republish tile.
- The Helix 401 copy still points at Manage Site Access, which is the wrong remedy for a
  missing session; the guard's own message covers the common case now.

Filed 2026-09-24.
