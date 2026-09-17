---
id: AB-11
kind: feature
area: app-builder
parent: AB-9
needs: []
value: low
status: backlog
---

# Explain the optional App Management listing, and warn that unassociating deletes settings

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

## Two records, and what each is for (research, 2026-09-17)

"Association" is two records:

- **App Management's own record** (org, Commerce instance, workspace). It decides whether the
  app is listed in App Management, its status, and whether the Configure form for the app's
  business configuration exists. Only the Associate App button creates it; there is no public
  API or CLI.
- **The app's own record** (`system.association`: the Commerce base URL and flavour, in the
  app's Files and State). App Management writes it by calling the app's generated
  `association` action ("you don't call it yourself", per Adobe's docs). The app's own code
  reads it through `getCommerceClient()` / `getCommerceInstance()`, which throw
  `AssociationRecordNotFoundError` without it. Demo Builder writes it directly today.

The install step (events, webhooks, the Admin UI SDK menu registration) takes the Commerce URL
from its request and does not need either record. App Management is needed for its listing and
status, its Configure form, and as Adobe's supported route for Admin UI SDK v2 menus (v1 is
deprecated). Adobe's starter kits dropped their manual onboarding scripts for it.

Unassociating permanently removes the app's configuration values for that instance (Adobe's
docs); the likely mechanism is App Management removing the Commerce scopes from the app's
scope tree, which orphans the saved values (inferred).

## The design (owner, 2026-09-17, revised the same day)

**No Associate step for the SC.** What the integration uses worked on Bodea with the app
unassociated: its Commerce Admin menu, the order webhook (an order reached the ERP), and the
settings read and saved through the integration's own action. The benefit is Adobe's library
(install, uninstall, upgrades, settings storage), which Demo Builder already drives; the App
Management screen adds only a listing, its own Configure form (the integration has its own
page) and upgrade/uninstall buttons.

So Demo Builder keeps installing the integration on its own, and this item becomes:

1. Tell the SC, once, that App Management can list the app if they associate it there (the
   Project and Workspace to pick), and that it is optional.
2. Warn, wherever association is mentioned, that **unassociating in App Management deletes the
   integration's settings for that store** and cannot be undone.
3. Keep writing the app's own record (the Commerce URL) at install, since the integration's
   actions read it.

Filed 2026-09-17.
