# Step 10: wiping a store completely

Status: **to do; not designed yet** (owner's ask, 2026-10-27).

Removing a pack takes away what that pack installed. The SC also needs to take a whole store
back to empty, whatever put the data there: a pack, an earlier demo, or hand edits.

- **The service has nothing for this.** It knows two operations, `import` and `delete`
  (`OPERATION_MODES`, `actions/constants.js`), and its delete removes one pack's named items.
  Its "purge by commerce_instance" (`getInstalledDatapacks.js`) deletes its own install
  RECORDS for an instance, not anything in Commerce.
- **The ERP work already knows some things Commerce will not delete over REST**, and what it
  does instead:
  - an inventory source cannot be deleted, so it is switched off (`warehouseFix.ts`);
  - notes the ERP wrote on orders cannot be deleted; its `erp/detach` reverts what it can
    (credit limits, blocks, ERP order numbers) (`erpDetach.ts`).
  Those are the start of the list, not the whole of it.
- **What a wipe has to settle before it is built:**
  1. **The full list of kinds a demo store holds**, and for each one whether Commerce deletes
     it over REST, only switches it off, or keeps it whatever we do. Orders, invoices and
     the store's own default website and root category are the likely "keeps" to check;
     none of this is verified yet.
  2. **The order to delete in**, the reverse of the install order (catalog spec §0), so nothing is
     refused for still being in use.
  3. **What is never touched:** the default website, store and root category, the admin
     users, and the integration's own credential.
  4. **What the SC is told afterwards:** exactly what could not be removed, by kind and count.
- **It cannot be undone, and it says so.** A wipe removes things no install record lists, so
  there is nothing to restore from (rule 1: what cannot be undone is stated plainly). It is
  confirmed before it runs, names the store it will empty, and is never run by an agent
  without that confirmation (rule 5). A dry run lists what it would delete and writes nothing.
- **Afterwards every install record for that store is cleared**, since what they list is gone.
