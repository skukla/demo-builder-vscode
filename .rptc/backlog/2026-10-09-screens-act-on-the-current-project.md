---
id: AI-15
kind: fix
area: ai
needs: []
value: high
status: active
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

**The same fault from the other side (2026-10-12, 14:02 to 14:14 local).** An agent created
a project (`create_project`, finished 14:02:36) and went on working on it. At 14:04:01 the
Your Projects screen sent `selectProject` for JustRite: the log line `Selected project:
justrite` carries no agent call id, and the only two senders of that message are click
handlers on a project card (`projects-dashboard/ui/index.tsx`). From then on the agent's
tools answered for JustRite: `run_commerce_query` at 14:04:02 and `get_storefront_report` at
14:09:21 (it named `skukla/kukla-justrite`). Nothing told the agent. It called
`set_current_project` at 14:14 and carried on.

What was ruled out by reading: the named reads (`get_project`, `get_component_config`,
`list_projects` in `mcp/projectToolHandlers.ts`) read the manifest from disk and write no
state; and creation does select the new project (`finalizeProject` saves through
`saveProject`, and a separate create that morning left its project current).

So there is one current project, and a person's click and an agent's task both move it and
both read it. Point 1 above covers the agent moving it under the person. This is the person
moving it under the agent, and it needs its own answer: an agent connection that has been
working on a project should either keep acting on that project, or be told in the tool's
answer that the current project changed since its last call.

## Shipped so far
- 2026-10-09  fix(dashboard): Add another ERP says when the integration is not in the current project (`f045b0c7d`)
- 2026-10-19  Owner decisions (2026-10-19): (a) an agent's create_project does NOT make the new project current; it says it created it. (b) each screen sends its own project with every request and handlers act on that project. (c) every agent tool answer says when the current project changed since the agent's last call, naming both.
- 2026-10-19  Owner (2026-10-19): an agent's set_current_project switches only the agent's working project, never the person's. Plan: .rptc/plans/ai-15-project-per-surface/overview.md
