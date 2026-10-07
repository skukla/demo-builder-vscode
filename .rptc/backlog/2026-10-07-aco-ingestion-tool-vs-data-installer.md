---
id: DI-4
kind: question
area: data-installer
needs: []
value: low
status: open
---

# Has the Data Installer superseded the ACO data ingestion tool?

Filed 2026-10-07 from the owner, after PR-1a's step 0 found the ingestion tool unreachable:
"The data ingestion tool is meant to assist with the importing of data for ACO. This may be
superseded now with the use of the Data Installer."

## What was found (2026-10-07, code read and one live run)

- `commerce-demo-ingestion` (`src/features/eds/services/toolManager.ts`, and a
  `tools.commerce-demo-ingestion` entry in `components.json`) imports and deletes catalog data in
  Adobe Commerce Optimizer (`import:aco`, `delete:aco`) and in Commerce (`import:commerce`,
  `delete:commerce`).
- **Nothing reaches it.** `ToolManager` is constructed only for `CleanupService`, which calls it
  only from `cleanupBackendData`; that runs when `options.cleanupBackendData` is set and the
  metadata has an `aco`/`commerce` `backendType`. No caller sets either. No import path calls it
  at all.
- **Its data source is gone.** `toolManager.ts` names `skukla/vertical-data-citisignal` (404); the
  repository is now `PMET-public/vertical-data-citisignal` (private), and none of its branches
  (`main`, `accs`, `accs_new`) has the `definitions/project.json` layout the tool reads; they are
  Magento modules (`data/`, `etc/`, `media/`).
- Two sources for the tool's own repo: `toolManager.ts` says `skukla/commerce-demo-ingestion`,
  `components.json` says `PMET-public/commerce-demo-ingestion`.
- It installs and starts on Node 24 (PR-1a step 0), so Node is not the obstacle.

## The question

Does the Data Installer (datapacks, through the data-installer service) cover what the
ingestion tool did for ACO, so the tool and its code can be deleted? Or is ACO catalog import a
job the Data Installer does not do yet?

## What would answer it

1. Read what the Data Installer can import into an ACO tenant today (its service's datapack
   types, and whether an ACO backend is a target), against the tool's `aco/import.js`.
2. Ask the owner whether any SC still runs the ingestion tool by hand, outside Demo Builder.
3. If covered: delete `ToolManager`, `CleanupService.cleanupBackendData` and its types, and the
   `components.json` entry (no soft deprecation). If not: file what the Data Installer lacks for
   ACO, and decide whether the tool is revived or the gap is built there.

## Related

[[PR-1a]] (its decision 2 waits on this), [[DI-1]].
