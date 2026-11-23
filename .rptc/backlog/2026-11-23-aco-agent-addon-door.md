---
id: PL-123
kind: fix
area: ai
parent: PL-60
needs: []
value: med
status: backlog
---

# An agent turning ACO on or off goes through the same door as Configure

Filed 2026-11-23, from the code review of the ACO branch's merge with develop (finding F5).

A person turns the ACO add-on on or off in Configure's ACO tab. Its save runs
`applyAcoAddonChange` (`src/features/dashboard/handlers/acoCredentialHandlers.ts`), which checks
the package offers ACO, runs the Adobe guards, sets up the ACO credential before the add-on, and
refuses to turn ACO off while an ACO datapack Demo Builder loaded is still in the instance.

The agent's `configure_project` does none of that. It writes the add-on list as given
(`src/features/ai/server/configureProjectTool.ts`: `project.selectedAddons = input.addons`), so an
agent can turn ACO off with packs still loaded and the credential still subscribed, or on with no
credential. That is two doors for one action with different rules, which the call-path rule in
CLAUDE.md forbids ("one path means one entry-point layer").

Not new with the merge: the branch had it before. Left out of the merge on purpose, as a change to
an agent tool's behaviour rather than a merge resolution.

## To do

When `configure_project`'s add-ons add or drop `adobe-commerce-aco`, run `applyAcoAddonChange` and
answer its refusal; the other add-ons keep the plain write. Tests: on, off with a pack loaded
(refused), off with none, and the package that does not offer ACO.
