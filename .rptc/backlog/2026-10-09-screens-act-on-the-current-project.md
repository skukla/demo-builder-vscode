---
id: AI-15
kind: fix
area: ai
needs: []
value: high
status: backlog
---

# A screen opened for one project acts on whichever project is current

**What happened (2026-10-09, 14:30 to 14:35 UTC).** The owner had the Integrations screen
open for JustRite and removed Kukla ERP, then tried Add another ERP ("Accuform ERP"). At
14:32 an agent's `create_project` finished a scratch project and made it the current one
(`state.json` `currentProjectPath`). The screen still said JustRite, but every handler
behind it resolves `stateManager.getCurrentProject()` (`appBuilderComponentOperation.ts`
`resolveComponentTarget`), so the add ran against the scratch project, found no
`erp-integration`, and the owner was told it "does not serve several ERPs". The Kukla
removal, started two minutes earlier, kept its own project object but its finishing
snapshot read the current project, so the JustRite screen was left showing the card
mid-removal. `get_erp_status` from the agent answered "not found" for the same reason.

**Two things.**

1. **The agent's `create_project` must not silently switch the person's current project.**
   It should say in its answer that it did (and the human surface should show a notice), or
   not switch when a project is open on a screen: creating a project for a colleague's demo
   while the SC works another one is a normal thing to ask an agent for.
2. **A screen should act on the project it was opened for.** The Integrations screen, the
   dashboard and Configure all know their project (they show its name). Their handlers take
   the current project. Either the screen passes its project path with every request and
   handlers resolve by it (the projects list handlers already take `projectPath`:
   `projectFromPath.ts`), or a screen whose project stops being current says so and
   refreshes. The wrong-message half is fixed: the add now says the integration is not in the
   current project, naming it (erpAddHandler, same day).

## Shipped so far
