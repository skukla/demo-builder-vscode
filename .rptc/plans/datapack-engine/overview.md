# Demo Builder installs datapacks itself, beside the service — plan (2026-10-27)

Supersedes the "install" half of `.rptc/plans/datapack-primary/` (on `feature/datapack-zip`),
which proposed the same direction and left it undecided. Decided by the owner today.

## Why

The Data Installer service is not something we can rely on (owner, 2026-10-27). In one day:
its old address went dark (404); its new Production deployment cannot reach its own database;
its new Stage deployment needs an org header we did not send (fixed in beta.150/151); and a
commit that morning ("remove the postman backward compatibility params") made it ignore the
Commerce credentials callers send, so every dry run and import now fails with "Pre-flight
check failed for all configured site types (accs, local)". Reading still works: the catalog,
every pack, every item.

## The shape (owner, 2026-10-27)

- **Two engines behind the same buttons.** Dry run, install and remove look and work the same
  for the SC, from the screen, the wizard's creation step and the agent tools. Underneath:
  the **Demo Builder engine** (new: writes the pack into Commerce over REST from the
  extension) and the **service engine** (what exists today, unchanged).
- **One setting picks the engine.** `demoBuilder.dataInstaller.engine`: `demo-builder` or
  `service`. If the service is fixed, switching back is a setting change.
- **Our engine installs a pack from wherever the screen lists it** (owner, 2026-10-27): the
  service's catalog, the datapack library, or a datapack zip file. It needs only the pack's rows,
  so a library pack is installed straight from the library, with no copy into the service's
  catalog first. That copy ("Copy to the Data Installer", `copy_library_datapack_to_installer`)
  is kept only for the service engine, which can install nothing else; it cannot be undone from
  the extension and has never run live. Store-settings packs (step 5) depend on this, since the
  service's catalog will most likely refuse that kind. The library and zip files came in by
  merging `feature/datapack-zip` into this branch.
- **Each installed pack records which engine installed it, and removal always goes through
  that engine.** Each engine knows exactly what it wrote; nothing either creates is ever
  removed by the other, and nothing is stranded (rule 1: whatever can be done can be undone).
- **Our engine's record of what it created lives beside the project**, not in the manifest:
  one file per installed pack, listing every Commerce object it created by kind and id. The
  manifest's `datapack` gains `engine`.

## What is reused, and what is not (owner, 2026-10-01 rule, reaffirmed today)

Reused: all the DATA (read from their catalog), all of their KNOWLEDGE (we read their
processors as the specification: order, endpoints, request shapes, transforms, the quirks
they hit, how they remove), and our own parts (Commerce REST writes from the ERP work, the
progress window, agent tools, the datapack library and zip files). Not reused: their code.
Ours is written from scratch, tested, and checked live.

## What a pack holds (measured 2026-10-27, read-only, Stage)

42 packs; 25 data kinds. Catalog kinds are the common ones (categories 30 packs, product
attributes 29, attribute assignments 29, products 28, stock links and source items 25,
attribute sets 22). Customers 12, cart rules 11, coupons 9, ACO kinds 8, customer groups 6,
B2B kinds 4, stocks and sources 4, gift cards 2. Bodea `main` (ACCS) holds 14 kinds, about
100 items in all: 56 products, 7 attributes, 4 attribute sets, 6 customers, 3 companies.

## Steps

1. **The engine seam, no behaviour change.** A `DatapackEngine` interface over what the write
   side does today: check credentials, dry run, start install, start remove, follow the job,
   list installed. The service engine wraps today's clients exactly. Every caller (Data
   Installer screen, wizard creation install, project reset removal, agent tools) goes through
   the seam. The setting exists, defaulting to `service`. The record gains `engine`. Proved by
   today's tests passing unchanged.
2. **Our catalog engine.** Product attributes, attribute sets, attribute assignments,
   categories, products, sources, stocks, stock links, source items — install, dry run and
   remove, from the specification read off their processors. Each writes, then records what
   it created; remove takes away exactly that, in reverse order. Dry run lists what install
   would create and writes nothing. Unit tests from captured Commerce answers, then live on a
   throwaway ACCS store (never Justrite or a colleague's), on the owner's go.
3. **Our engine becomes the default.** A test-plan row for each of dry run, install and remove.
4. **Customers and B2B** (customer groups, customers, companies, shared catalogs and their
   assignments). Completes Bodea.
5. **Store settings in a pack** (owner's ask, 2026-10-27). A new kind, `store_config`: rows of
   `{path, value, scope, scope_code}`. Install reads and records each setting's current value,
   then writes the new one through `PUT /V1/system/config` (the writer the setup guide's config
   steps already use; ACCS since 2026-09, proven live 2026-10-10), and reads the response's
   `errors`, since a 200 can carry refused items. Remove restores the recorded values. Scope
   codes are mapped to the install target's website and store. Export reads a chosen list of
   paths back out of a store. Limit: packs that carry it live in OUR library and zip files;
   the service's catalog checks each kind against its own list and will most likely refuse an
   unknown one.
6. **Later, when a pack needs it:** cart rules, coupons, gift cards, ACO.

## Where packs live: the library is home, the service is read (owner, 2026-10-27)

- **The library is where the team's packs live.** It answers the same routes as the service's
  database (datapack-store step 02b), so one writer (`writePackToStore`) puts a pack into
  either store, and one reader (`readPackFromStore`) reads from either.
- **The service is a source we read from, not something we depend on.** Reading works; its
  install, removal and export do not. Our engine installs a service pack by reading its rows
  from the service, with no copy first. A pack we depend on should also be in the library,
  since the service's reads have failed before (its old address went dark).
- **"Copy to the Data Installer" stays**, with its agent tool, and it is the way back to the
  service: the service engine installs only packs in the service's own database, so if the
  service is fixed, or we are allowed to upload into it, a library-only pack is copied there
  first. It still cannot be undone from the extension and has not run live.
- **Export is the gap.** Export, reading a store an SC set up into a new pack, is the only way
  new packs are made, and the service's has failed to save what it reads since August. Ours
  is written per data kind, beside its install and removal, and writes into the library.
- **Next, in order:**
  1. **Audit the service's 42 packs** (read-only): owner, dates, kinds, size, for the owner to
     mark keep or drop. Some are old.
  2. **Bring the kept packs into the library** with the existing copy from the service.
  3. **Keep in step, one way, service to library:** a pack is its name plus version; bring
     over any pair the library lacks and never overwrite one it has. On demand first.
  4. **Research:** whether a Stage workspace has limits or clean-up rules a production one
     does not, before the library is relied on.

### The packs the library starts with (owner, 2026-10-27)

Audited read-only on the service's Stage catalog the same day: 42 packs, 23 shared. Versions
were compared item by item, by content hash.

- **Eleven brands, one version each:** `bodea`, `carvello`, `citisignal_new`, `frescopa`,
  `grocery`, `healthbeauty`, `wecafe` and `wknd` at `main`; `citisignal_original`, `luma` and
  `venia` at `eds-compatible`. Bodea's `tierpricingfix` and the `v1.0` of Grocery and We.Cafe
  are identical to `main`; each `hold` is an older copy.
- **The eight ACO packs** (`aco_<brand>` at `main`), held in the library although our engine
  does not install ACO kinds yet.
- **Left behind:** the `legacySkus-20260522` versions (older product SKUs than `main`), the
  archive copies, the test and personal packs, and `dsc-enablement-sample0`.
- Nothing in Demo Builder names a pack version, and no project on the owner's machine records
  one, so the choice strands nothing here.

### Items too big to read (measured 2026-10-27)

The `product_export` items of `luma` and `venia` (both versions each) cannot be read through
the service: with their rows, `batch-get-data-items` and `get-data-item` answer 400 "Response is
not valid 'message/http'"; without them, they are found. The service stores each data kind as
one document and has no way to return part of one (`actions/database/getDataItem.js`). The
largest item that did read was 357 KB. Most likely the runtime's limit on how big an answer can
be; the documented figure is not yet checked. Venia also ships its products as `products`, which
reads; Luma ships products only as `product_export`.

- **Our library will hit the same limit**, being on the same platform: it stores a large kind in
  several pieces, and the copy reads and writes it piece by piece.
- **The four items: read from the service's database directly** (owner's choice), with the
  connection settings the owner's Stage developer access can read. Read-only. Not yet done: the
  agent was refused access to another service's credentials, so the owner runs or authorises it.
  Tabled 2026-10-27 (owner away from the machine); Luma's products and Venia's `product_export`
  wait on it, and the other packs do not.

## Wiping a store completely (owner's ask, 2026-10-27; not designed yet)

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
  2. **The order to delete in**, the reverse of the install order (spec §0), so nothing is
     refused for still being in use.
  3. **What is never touched:** the default website, store and root category, the admin
     users, and the integration's own credential.
  4. **What the SC is told afterwards:** exactly what could not be removed, by kind and count.
- **It cannot be undone, and it says so.** A wipe removes things no install record lists, so
  there is nothing to restore from (rule 1: what cannot be undone is stated plainly). It is
  confirmed before it runs, names the store it will empty, and is never run by an agent
  without that confirmation (rule 5). A dry run lists what it would delete and writes nothing.
- **Afterwards every install record for that store is cleared**, since what they list is gone.

## Open questions

- Their service ran installs in background workers because of App Builder time limits; ours
  runs in the extension with no such limit, but VS Code must stay open. Is a long install
  resumable if the window closes? (Answer before step 2 ships; first answer: record per
  item, so a re-run skips what exists.)
- Which ACCS store to install into for live checks: a throwaway one is needed.
