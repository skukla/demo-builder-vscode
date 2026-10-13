---
id: PL-76
kind: fix
area: platform
needs: []
value: high
status: active
---

# Configure saves what changed, in one place, and tells the truth about it

Filed 2026-10-13. The owner: "Configuring a project is used more often than editing one, so
we need to nail down what configuring will do and make sure that it is solid." The audit
and the contract are in `.rptc/research/configure-audit/research.md`; the owner agreed the
contract and the order the same day.

## The contract

1. It shows the project as it is now, every time it opens.
2. Save writes what the SC changed, and nothing else.
3. Save is whole, or says exactly what it did.
4. Every saved change says how it takes effect, and the follow-up really applies it.
5. One save: the agent's `configure_project` goes through the same code as the button.

## Order

1. **Save sends only what changed**, and a re-opened Configure starts from the project as it
   is now. Stops the silent reverts (a rename undone, authoring flipped back, an agent's
   store scope overwritten, a removed integration's settings brought back).
2. **One save service on the extension host** for the button and `configure_project`:
   storefront staleness and `.env` regeneration for agent changes, the right store-code keys
   for PaaS, secrets written only once the save has succeeded.
3. **Small fixes:** the Restart prompt (Later, re-arm, the mesh-only prompt that promises a
   restart), a DA.live session for Configure's Republish, secret-aware Save validation, no
   secret values sent to the screen, error handling on the post-save prompts.
4. **A live check** of a real save on a scratch project, row by row; then a doc that lists
   the tabs, and the stale ADR-003/ADR-004 lines and release test plan row 3.4 corrected.

## Shipped so far
- 2026-10-13  fix(configure): Save sends only what changed; a re-opened Configure starts fresh (`d1849c70b`)
