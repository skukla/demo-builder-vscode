# Systems get their own card, linked to the integrations that use them

Owner-directed, 2026-09-17. Reverses decision 6 of `.rptc/plans/erp-integration/overview.md`
(one tile, two flyout sections). Backlog: AB-9.

## Why

Decision 6 put the ERP inside its integration's card: the face shows the worse of the two
statuses, the kebab carries the ERP's verbs under their own names (Open ERP, Reset ERP
records, Redeploy ERP), and the flyout has a second section for it. The owner found the
flyout large and hard to maintain. Measured the same day: the card model names the system
46 times, and each feature since has needed pair-only code (step 4's reinstall and step 5's
update both asked "which half?"). A shorter flyout would keep all of that.

Two tiles make each one an ordinary card: its own status, its own Update, Redeploy, Open
and flyout. The pairing stays where it already lives, in the extension: removal is a unit,
the ERP cannot be removed alone, and the reset runs through the integration. The tiles only
have to show the link and say so in their confirmations. It also matches the story an SC
tells: an ERP, Commerce, and the integration between them.

**A system card, not a second integration card** (owner, same day). More system types are
coming (CRM, OMS), and possibly more than one of a kind, so the ERP gets a card of its own
kind rather than an integration card with fewer items. A system shows different things (its
screen, its records, which integrations use it) and has different verbs (Open screen, Reset
records); an integration shows its Commerce install, its APIs and the Admin link.

What does not change: one gallery tile adds both, ERP first (decision 7); both deploy into
the same workspace; the ERP stays a `kind: 'system'` component.

## Behaviour

1. **Two cards, side by side.** The system card sits right after its integration's. Each
   card's face carries a link icon (`@spectrum-icons/workflow/Link`) and the other card's
   name, so linked cards can be spotted across the grid; each flyout has a row ("Uses" on
   the integration, "Used by" on the system) whose link opens the other card's flyout.
2. **The system card carries a small badge with its type** ("ERP"), a Spectrum `Badge`
   (neutral) beside the name on the face, and the same type as the kind line in the flyout
   (where an integration says "Pre-built"). The SC names the system ("Nordwind"), and an
   invented name does not say what the thing is; the badge is also what marks a card as a
   system card at a glance. The type comes from the catalog; the SC never sets it. (The
   face shows only the name and one status line today, so without the badge nothing on
   the face would say it.)
3. **Status is each card's own.** No worse-of-two face. The Linked row shows the other
   card's status, so a broken half is one click away and visible on its own card.
4. **Verbs by card.**
   - Integration: its own verbs as today (Update, Redeploy, Install/Reinstall in
     Commerce, Open Commerce Admin, Manage APIs, Remove).
   - ERP: Open (its screen, keyed as today), Reset records, Update, Redeploy, Remove.
     Reset lives on the system card only (owner).
     The `*-system` actions become ordinary actions on the ERP's own card; Reset still
     posts `resetErpRecords` with the integration's id, because the reset runs through
     it (decision 11).
5. **Remove on either card removes both.** The confirmation names both, in the order they
   go: "Removes ERP integration and Acme ERP." The runner's refusal to remove the ERP
   alone becomes a cascade: removing the ERP removes its integration first, as removing
   the integration does today.
6. **Update and reinstall.** Each card's Update updates that component. Updating the
   integration still takes the ERP first when the ERP has an update (step 5).
7. **The dashboard's Integrations tile counts both.** It reads integrations only today, so
   the ERP's health never shows there.
8. **The link is stored per project, not read from the catalog, as a list.** The
   integration's record lists the systems it uses (`systems: [id]`); each system's record
   names its integration (`usedBy: id`). Written when the pair is added, with a migration
   for projects that already have the pair. The catalog's `boundTo` then only says which
   system an integration brings. A list from the start because the common demo is one
   integration with several ERPs (AB-16); only one can be added until AB-16 is built, and
   nothing here depends on there being one. The integration card's Uses row lists every
   system.
9. **Agents.** Nothing new: every verb already has a tool by id. `remove_integration` on
   the ERP removes both instead of refusing; its description and the alert copy say so.
10. **Wizard.** The gallery keeps one tile with its "comes with" line; the build summary
   already lists both.

## Steps

1. **The stored link.** A `linkedTo` field on the component record (type, manifest schema),
   written by the add path for the pair, read by removal and the card model instead of the
   catalog; a load-time migration for existing pairs. Tests for add, remove and migration.
2. **Card model.** A system card kind: `buildIntegrationCards` emits it after its
   integration, with the system type as its kind label and the link (id, name, status) on
   both cards. Remove `pairFace`, `worstOf`, `BoundSystemModel`, `system` on the card
   model, and the `*-system` card actions. The system card's menu: open, reset, update,
   redeploy, remove. Tests rewritten from `integrationCardModel-boundSystem.test.ts`.
3. **Card and flyout.** The link icon and name on the card face, and the Uses / Used by row
   in the flyout that selects the other card. The system card's flyout: status, type, its
   screen, last deploy, source, Used by. Delete `SystemSection`. The grid's remove confirmation names
   both halves for either card.
4. **Removal: the cascade, and the gaps the spike found.** `refuseBoundSystemAlone`
   becomes "remove the consumer first"; runner and handler tests for both entry points; the
   MCP description and alert copy. In the same step, the removal defects below.
5. **Summary tile** counts systems; tests.
6. **Docs**: `erp-integration.md` (On the dashboard), the plan's decision ledger (a new row
   superseding decision 6), changelog, mcp-tools regen.

Each step keeps the gate green. Visual check with the webview baseline instrument on the
integrations surface (resting and interaction states), since the card grid changes.

## Settled with the owner (2026-09-17)

- The face carries a link icon with the other card's name.
- The system card is its own kind, marked by a small type badge.
- Reset lives on the system card only.
- The pair sits side by side with the link line; no shared outline or connector.

## Left to decide while building

- The link line is a second quiet line on the face; today every card has exactly one, so
  linked cards would be a line taller than the rest. Either give every card the second line's
  height or put the link beside the status. Decide with the visual baseline instrument, on
  the real grid.

## Removal and multiple ERPs: what the code-only spike found (2026-09-17)

Read from code, nothing run live. Confirmed by hand where marked.

**Removal works in order** (uninstall from Commerce, undeploy, verify Runtime packages,
delete the folder, clear state, forget the screen key, then the ERP the same way), with
these gaps:

1. **Commerce kept what the ERP wrote. Fixed 2026-09-17.** The integration's `erp/detach`
   undoes the company credit limits and blocks and the ERP numbers on orders, and its
   comment said Demo Builder ran it before removal; nothing did (checked by hand), and the
   undeploy then deleted it. Removal now calls it first (`erpDetach.ts`), carries its
   counts on the result, and warns when part of it could not be undone.
2. **A failed Commerce uninstall is only logged.** The undeploy that follows deletes the
   uninstall API, so the webhooks and subscriptions stay and the SC is not told. Fix: say so
   in the result, and consider stopping before the undeploy.
3. **The ERP's cleanup summary is discarded**, and a failed ERP removal is only logged, so
   the result can say "removed" with ERP code still deployed.
4. **A missing component instance throws after the undeploy** (`removeComponent`), leaving
   the state uncleared and the ERP not removed (checked by hand: it throws, uncaught there).
5. **A re-add brings the old ERP records back:** nothing wipes the ERP's database on add or
   remove, though the flyout says the records stay "until a new ERP replaces them" (and
   `erp-integration.md` said "a re-add starts with a reset"; corrected). Fix: reset on
   re-add, or say plainly that they return.
6. Not checked: whether `aio app undeploy` removes the triggers (`erp-refresh-timer`,
   `events-retry-timer`); the runtime check lists packages only. Also left: business-config
   values and the integration's company ledger (expires after 365 days); App Management's
   "Associated" listing (AB-12).

**Several ERP integrations:**

| Case | Verdict |
|---|---|
| Twice in one project | Refused (duplicate id; custom id of an extension app refused) |
| Two projects, one workspace | Conflict: fixed package names, one screen key replaces the other, shared database; removing one removes the other's packages. No check refuses it |
| Two workspaces, one Commerce | Conflict: webhook and event subscription names are fixed per app id, so the second install skips them and either uninstall deletes both; two ERPs write the same catalog |
| Separate workspaces and Commerce | Safe as far as the code shows |

Both conflicts want a refusal at add time naming the other project, until someone needs
them to coexist: AB-15, not part of this plan.

**Live validation**, each step for the owner to approve: add the pair; make an order and a
credit-limit change; remove from the card and re-list webhooks, subscriptions, providers,
registrations, the Admin menu, packages, triggers, `ext_order_id` and the credit limit;
repeat with the uninstall made to fail; re-add and look for old records; then the
same-workspace and same-Commerce cases.
