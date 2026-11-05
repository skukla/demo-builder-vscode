---
id: DI-11
kind: feature
area: data-installer
needs: []
value: low
status: backlog
---

# One Export motion for a datapack's copies

Filed 2026-11-05, from the owner's question during the beta.153 release walk: should Share become
Export, so one motion covers both Demo Builder's datapack store and the Data Installer?

## Recommendation

**Keep Share separate. Consider one "Export" only for the two actions that make a copy elsewhere.**

A datapack's flyout has three ways to send a pack somewhere, and they are not the same job:

| | Share | Save as File | Copy to the Data Installer |
|---|---|---|---|
| What it does | Lets other SCs see a pack already in the store; nothing is copied | Writes a zip the SC keeps | Copies the pack into the catalog other teams use |
| Undone by | Stop Sharing | Deleting the file | Nothing: the extension cannot remove a pack from the Data Installer (`datapackLibraryHandlers.ts` header; `CopyToInstallerButton` warns before the press) |
| Offered to | Every SC, on their own pack | Everyone | Only with `demoBuilder.dataInstaller.engine` set to the service |

Folding Share into Export would put an action that can be undone beside one that cannot, under one
word. The "whatever can be done can be undone" property makes the second the one to be careful with.

## When it is worth doing

Save as File and Copy to the Data Installer both make a copy somewhere else, so an "Export…" with a
destination choice is a real simplification for those two. It waits on the Data Installer being
usable again: since 2026-10-27 the service ignores the Commerce credentials a caller sends, so the
service engine installs nothing for us (`selectedDatapackEngine` docstring), and most SCs have no
access to write to it.

## Not in scope

The ACO export (`acoExportHandler.ts`) and the service-engine Create Datapack, which already exports
into the shared catalog (`CreateDatapackModal`). Either may belong in the same dialog once the above
holds; that is a decision for then.
