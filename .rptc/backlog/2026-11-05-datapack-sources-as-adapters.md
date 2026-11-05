---
id: DI-12
kind: feature
area: data-installer
needs: []
value: med
status: backlog
---

# Datapack sources as adapters, and one setting for either or both

Filed 2026-11-05, after beta.153's release walk. The owner's aim: the Datapacks feature is the glass
over whichever data source is on, each source an adapter, so an SC sees little difference between
a pack from Demo Builder's store and one from the Data Installer. Both sources may be on at once,
and it should be easy to read which are.

Research, with all 62 decision points measured: `.rptc/research/datapack-source-adapters/research.md`.

## Two parts

1. **One descriptor per source, not adapter classes.** Following the house conventions (handbook §4,
   rows over classes; ADR-025's one-descriptor seam, as `agentEngine.ts` does for agents): a
   `DatapackSourceDescriptor` per source, and every catalog row and detail carries what it allows
   (share, rename, remove, save changes, update from a file, undo a load) and its owner and
   visibility text. The webview reads those instead of naming a store. Routing stays one client and
   one access function; installing already sits behind `DatapackEngine`.
2. **One setting for the sources.** A "Datapack Sources" group. At least one working source must
   power the feature, and Demo Builder's store is the only place an SC can save a pack until the
   Data Installer's owners accept outside writes, so the store is always on and the Data Installer
   keeps its checkbox (owner, 2026-11-05). The engine stops being a choice the SC makes.

## The service engine: delete it once nothing is lost (owner, 2026-11-05)

The owner's condition: delete it as long as no functionality is lost. Checked the same day against
`.rptc/research/datapack-engine/service-parity-import-delete.md`. Nothing that WORKS today is lost
(the code records the service ignoring our Commerce credentials since 2026-10-27, so it installs
nothing for us), but two things exist only on the service's side on paper:

1. **`product_export` and `customers_export`**, the bulk forms of products and customers. Demo
   Builder's engine installs 19 of the service's 21 data types and refuses these two. Luma's
   products exist only as `product_export`, and DI-8 says Venia's do too. So the deletion waits on
   [[DI-8]], which is itself gated on the owner reading those items from the service's database.
2. **Removing a pack the service installed.** Ours refuses a pack it has no record of. Clear Demo
   Data covers products, categories, customers and cart rules; the rest has no route either way
   while the service refuses our credentials.

Not checked live: whether the service's export, behind the service engine's Create route, still
works today. Check it before deleting that route. Reading the service's job history for the
Activity tab is not part of the engine and stays.

## Size

About 4.5 to 5.5 working days, plus review between parts; the engine answer moves it by a day. The
breakdown is in the research.

Not for beta.153: the release behaves sensibly with both sources on.
