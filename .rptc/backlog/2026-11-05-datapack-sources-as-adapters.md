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

## Waiting on the owner

- Whether the service engine is deleted (it has installed nothing for us since 2026-10-27) or made
  automatic. Deleting it removes 14 install-path sites and the Copy to the Data Installer action.

## Size

About 4.5 to 5.5 working days, plus review between parts; the engine answer moves it by a day. The
breakdown is in the research.

Not for beta.153: the release behaves sensibly with both sources on.
