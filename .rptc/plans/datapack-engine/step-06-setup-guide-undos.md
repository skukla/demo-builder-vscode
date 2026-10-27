# Step 06: the setup guide's undos keep what changed since

Status: **to do**, after step 04. This branch's part of
[AB-83](../../backlog/2026-10-27-undo-leaves-what-changed-since.md), which holds the full table of
every undo and what each can lose; the ERP's detach is its own PR in `commerce-erp-integration`.

Decided by the owner, 2026-10-27, using step 04's rule:

- **Settings** (`configFix.ts`): a setting whose current value is not the one the fix wrote is
  kept.
- **Shared catalogs** (`sharedCatalogsFix.ts`): a catalog holding anything the fix did not put
  there is kept, with the company still unassigned from it; one holding only the fix's is deleted
  as today.
- **Warehouse** (`warehouseFix.ts`): a stock holding a source the fix did not link is kept, with
  the fix's own links taken out; sources are switched off only if still as the fix left them.
- Each says in one line what it kept. No "undo anyway".

It matters here because packs and the setup guide touch the same things (store settings: the
config fix and step 09's `store_config`; sources and stocks: the warehouse fix and the stock
kinds). With the rule, a pack's removal leaves a setting the guide changed since, and says so.
