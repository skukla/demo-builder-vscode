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
- **Both engines read packs from the same catalog** — the service's, which still answers.
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

## Open questions

- Their service ran installs in background workers because of App Builder time limits; ours
  runs in the extension with no such limit, but VS Code must stay open. Is a long install
  resumable if the window closes? (Answer before step 2 ships; first answer: record per
  item, so a re-run skips what exists.)
- Which ACCS store to install into for live checks: a throwaway one is needed.
