---
id: AB-82
kind: feature
area: app-builder
needs: []
value: med
status: active
---

# One place for store setup

Filed 2026-10-26, from release test row 4.19 on Justrite.

## What is wrong

The ERP integration's store setup lives in two windows that list the same steps:

| | Setup guide (`SetupGuideModal`) | Prepare this store (`PrepareStoreDialogs`) |
|---|---|---|
| Lists the steps with their state | yes, as dots in its rail | yes, as icons in a list |
| Where in Admin, what to type, why | yes | no |
| Apply or undo one step | yes | no |
| Apply every step it can at once | no | yes |
| Undo everything | no | yes ("Undo preparation", a separate menu item) |
| Steps done by hand | yes, in full | only the words "By hand" |

Prepare this store adds exactly one thing the guide lacks: apply everything at once (and
undo it all). The rest is a second list of the same steps, drawn differently. Row 4.19 of
the release test plan shows the cost: it sends the SC to Prepare to read the warehouse step,
then to the guide to apply it, then back to the guide to undo it. Two windows answering
"what does my store still need?" will drift, and already do (dots in one, icons in the
other; the guide's step note and Prepare's plain summary say the same thing in different
words).

The owner's decision (2026-10-26): consolidate into one path.

## The change

The setup guide becomes the one place.

1. **Apply all (N)** in the guide's buttons, beside Apply this step. N is the steps
   Demo Builder can apply that are not done. Disabled at 0. It runs the same
   `prepareCommerceStore` request Prepare runs today, into the same progress modal.
2. **No Undo all** (owner, 2026-10-26). The flyout's "Undo preparation" item and its confirm
   are deleted, not moved into the guide. Reversal stays, in the two places it is used:
   - the guide's **Undo this step**, one step at a time, which release test row 4.19 walks;
   - **Remove** on the integration, which undoes everything Demo Builder recorded before
     the integration goes (`erpSetupTeardown.ts`, since 2026-10-19).
   An SC who wants the store back as it was without removing the integration undoes the
   steps one by one; nobody has asked for more. The agent keeps
   `undo_commerce_store_preparation`, which still undoes all of it.
3. The guide's rail shows each step's state with the `StepStatusIcon` set Prepare uses
   (done, will apply, by hand, could not check), so the rail is the at-a-glance summary
   Prepare's list was.
4. The selected step's pane shows, for a step that will apply, the plain sentence of what
   Apply changes (the report's `summary`, else the step title), as Prepare does now.
5. `PreviewList` and its done-steps fold are deleted, not kept as an alternative.

### Doors and names

Measured on Justrite (2026-10-26): four ways in, three names, two destinations.

| Door | Where | Opens |
|---|---|---|
| "Demo setup: 7 of 8 done" | the card (`SetupStatus`) | the setup guide |
| "7 of 8 done", Next: …, "Open setup guide" | the flyout's Demo setup section (`SetupChecklistSection`) | the setup guide |
| Prepare this store | the flyout's Actions | the separate Prepare window |
| Undo preparation | the flyout's Actions | an undo-everything confirm |

Nothing told the SC that "Prepare this store" and the setup guide work on the same steps.
After this item:

- **One name: Demo setup.** "Prepare this store" and "Undo preparation" leave the UI as
  words. The section's link reads **Open demo setup** (it reads "Review setup" once every
  step is done, as now).
- **Two doors, one destination.** The card's line and the flyout's Demo setup section both
  open the guide. The flyout's section is the home: the count, the next step, the button.
- **The Actions list loses Prepare this store and Undo preparation.** Their jobs are Apply
  all in the guide and the per-step Undo.
- The progress modal's titles follow the name ("Applying the demo setup for …").

What stays:

- The confirm shown when the ERP integration is ADDED (`PrepareOnAddDialog`). It is the
  consent before the add writes to Commerce, a different moment, and it already shares the
  step row (`PreparationStepRow`).
- The per-step Apply confirm (`PrepareStepPreview`), which the guide already uses.
- The agent surface: `prepare_commerce_store`, `undo_commerce_store_preparation`,
  `check_setup_steps` and `set_setup_step` dispatch into the same handlers, which do not
  change. Say so in `docs/systems/mcp-server.md` only if a tool's description names a window.

## Also in this item: re-applying the warehouse after an undo

Commerce cannot delete a source, so undoing the warehouse step DISABLES the source it made
(`warehouseFix.undo`). Applying the step again then finds that source by its code or name
(`planFor`), treats it as existing, and links it without enabling it. The check now
reports a disabled warehouse as not done ("Test Warehouse is disabled."), so the step
stays at Will apply after every apply: the SC can never finish it from Demo Builder.

The fix: when the warehouse an ERP needs exists but is disabled, the apply enables it
(`PUT inventory/sources/{code}` with `enabled: true`), the preview says so ("Switch Test
Warehouse back on"), and the record notes it was re-enabled, so the undo disables it
again rather than leaving it on. Walked on Justrite as part of row 4.19: undo, then apply
again, then the step reads Done.

## Also in this item: the result, and a link priority

**The result read as centred paragraphs (fixed the same day).** After Apply on Justrite
(2026-10-26) the progress modal's success view listed "ERP warehouse:", its raw lines, "By
hand: …", then "Card payments:" and `payment/payment_services/active at the website scope:
0 → 1`, every line centred and the last cut off. The owner: it "looks awful and does not
match the extension's existing style". Landed before this item: the progress payload carries
`changes` (a row per step) beside the flat `details`, the success view draws them as
`WorkRow`s, settings lines speak the Admin's words ("Payment Services for the website: No →
Yes", from each config item's `field` and `values`), and warehouse lines name warehouses and
stocks rather than codes. Apply all lands on that view and needs nothing more from it.

**A new warehouse takes priority 1 beside the ERP that already has it.** The same apply
linked `test_warehouse` to Justrite Stock at priority 1, which `justrite` already held
(read back the same day: justrite 1, accuform 2, test_warehouse 1). `warehouseFix.apply`
numbers the links it adds from 1 (`i + 1`); it should start after the stock's highest.

## Done when

- One window lists the setup steps; the Integrations screen has no second list.
- The card and the flyout's Demo setup section are the only doors, both into the guide,
  and "prepare"/"preparation" appear nowhere in the UI.
- The guide can apply all, landing in the progress modal with a row per step listing what
  changed and what is left by hand (both landed 2026-10-26).
- Release test row 4.19 is rewritten to the one path, and walked, including an undo and a
  second apply that ends Done.
- The visual baseline captures the guide on the integrations surface before and after.

## Background (2026-10-26, same session)

These landed first and this item builds on them:

- The warehouse check counted the step done when ANY ERP's warehouse was sold; it now
  checks each ERP's own, as the fix makes them (`setupChecks.ts`, all four callers pass
  the ERP names).
- Prepare's list was redrawn with `WorkRow` (moved out of the Updates modal), the house
  spinner at the house size, done steps folded, one plain line per step to apply.

## Shipped so far

- 2026-10-26  Built uncommitted on feature/pl-80-updates-modal: Apply all under the guide's list, the old window and both menu items removed, one name (Demo setup), list marks, warehouse re-enable and priority, plain result rows. Apply all leaves out optional steps; the selected step's plain sentence is in its Apply confirm, not the pane. Visual baseline not captured: the browser tool was down.
- 2026-10-26  Same day, owner: no confirm or progress window for the guide's runs. Will do in the step's pane, Apply runs in place (useGuideRun), the pane says Applying, Done or Stopped; a run that asks a question goes to the progress window. The confirm file was removed; PreparationStepRow keeps the add confirm's row.
- 2026-10-27  feat(dashboard): the setup guide applies and undoes the demo setup in place (`92970b746`)
- 2026-10-27  chore: the setup guide is AB-82; AB-81 was already the ERP invoice item (`9798e5b51`)
- 2026-10-28  fix(setup-guide): steady layout, green Done, plain step copy, named undo refusal (`0aa3116be`)
