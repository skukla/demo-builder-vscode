# Step 10: reset clears a demo's part of the store

Status: **to do**, after steps 04 and 05 (reset's "save my changes first" box depends on them).
Decided by the owner, 2026-10-27.

## Why

An SC resets a demo to put new data in. The cases:

| What the SC wants | What does it |
|---|---|
| Swap to a different pack (Bodea's data, then Frescopa's) | Removing the pack, then installing the new one |
| Start the same pack over after breaking it in the Admin | Removing, then installing again (changes saved first, step 05) |
| Clear data Demo Builder did not install (hand-made in the Admin, the service's installs, an earlier demo's leftovers) | A wipe: there is no record, so removal cannot know these things exist |
| A clean slate for a new customer | A wipe |

## What reset does

1. **Reset always removes what Demo Builder installed**, from its install record. This covers
   most resets.
2. **If the demo's part of the store also holds data Demo Builder did not install, reset says so
   and offers to clear it too**: one unticked box, saying it cannot be undone.

   > **Reset Acme Demo?**
   > Frescopa's 64 items will be removed.
   > This demo's store also holds 31 things Demo Builder didn't install: 18 products and 13
   > categories.
   >
   > ☐ **Also remove those**, to leave this demo's store empty. This can't be undone.
   >
   > [Reset] [Cancel]

   With nothing else there, the box does not appear.
3. **It only ever clears this demo's part of the store.** The owner's one ACCS instance holds
   several demos (Justrite, Bodea and others), so emptying the instance would empty theirs:
   - **products** on this demo's website; one another website also sells is only taken off this
     website;
   - **categories** under this demo's own root category. If that root is shared with another
     store (as `justrite_test_website`'s is with Justrite's, root 119), categories are left and
     the screen says why;
   - **customers** of this demo's website;
   - **never** anything the instance shares (product attributes, attribute sets), the websites,
     stores and root categories themselves, admin users, or the integration's credential. A
     new pack reuses an attribute that is already there, so leaving them blocks nothing.

Emptying a whole instance is not part of reset. If it is ever offered, it is its own action with
the strongest warning.

## What has to be settled when it is built

- **What else a demo's part holds**, kind by kind (orders, invoices, cart rules, companies,
  shared catalogs), and whether Commerce deletes each over REST, only switches it off, or keeps
  it. Known so far, from the ERP work: an inventory source cannot be deleted, only switched off
  (`warehouseFix.ts`); notes on orders cannot be deleted (`erpDetach.ts`). Orders and invoices
  are the likely "keeps"; none of this is verified yet.
- **The order to delete in**: the reverse of the install order (catalog spec §0), so nothing is
  refused for still being in use.
- **What the SC is told afterwards**: exactly what could not be removed, by kind and count.

## Safety

- **The clearing cannot be undone, and says so.** It removes things no install record lists, so
  there is nothing to restore from (rule 1: what cannot be undone is stated plainly).
- It names the website it will clear, is confirmed before it runs, and is never run by an agent
  without that confirmation (rule 5). A dry run lists what it would clear and writes nothing.
- Afterwards the demo's install records are cleared, since what they list is gone.
- **The service has nothing like it**: it knows `import` and `delete` (`OPERATION_MODES`,
  `actions/constants.js`), and its "purge by commerce_instance" (`getInstalledDatapacks.js`)
  deletes its own install records, not anything in Commerce.

## Agent surface

Names are proposed; fixed when built.

| Tool | New or changed | Read or write | Chat wording | Dialog |
|---|---|---|---|---|
| `check_demo_data` | new: what Demo Builder installed in this demo's part of the store, and what else is there, by kind with counts | read | "Checking this demo's store data" | none |
| `reset_project` | takes "also clear the data Demo Builder did not install", off unless asked | write | unchanged | names the website it will clear, and says it cannot be undone |

**Lean answers:** `check_demo_data` answers counts per kind, never the objects. **Battery
prompt:** "Reset this demo and leave its store empty", expecting `check_demo_data` then
`reset_project` with the clearing asked for, and the agent asking the user first. Traced, then
`ai-coverage-scan`.

## Reuse

| Need | Reuse | Where it is |
|---|---|---|
| The reset confirmation | Project reset's existing confirmation and progress | `edsResetSampleData.ts`, `OperationProgressModal` |
| The box | The house checkbox row | `CheckboxRow` |
| Which website, store view and root | The same lookup the engine and Assign products use | `storeScopeOf` |
| Removing what Demo Builder installed | The engine's removal | `removePack` (`runPack.ts`) |
| Switching off a source | The ERP warehouse step's switch | `setSourceEnabled` |
