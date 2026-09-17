---
id: AB-11
kind: feature
area: app-builder
parent: AB-9
needs: []
value: med
status: backlog
---

# After install, hand the SC the App Management "Associate" step and confirm it

App Management keeps its own list of apps and the Commerce instance each is associated with,
and associating is a step in its screen (Apps ▸ App Management ▸ Associate App, then the
Project and Workspace). Demo Builder's install writes only the app's own association record
(`POST /association` on the app's generated action) and runs the app's installer, so on the
Bodea sandbox (2026-09-16) the ERP integration was installed and working but absent from App
Management until the owner associated it by hand. No API, `aio` command or Console step to
associate is documented (`.rptc/research/commerce-webhooks-and-events/research.md`).

What association changes, measured: the order webhook reached the ERP both before and after
associating, so webhooks do not depend on it. App Management's settings form, upgrades and
uninstall from its screen do. Unassociating "removes all configuration values for this
instance" and clears the app's own record.

## The likely shape

- After a successful install, the dashboard (and the agent tool's result) says the app still
  needs associating, names the Project and Workspace to pick, and links App Management.
- Demo Builder checks for the association before calling the integration done, if a way to
  read App Management's state exists; otherwise it asks the SC to confirm.
- Whether Demo Builder should keep writing the app-side record itself is open: see the research
  on why App Management and association are needed at all (in progress 2026-09-17).

Filed 2026-09-17.
