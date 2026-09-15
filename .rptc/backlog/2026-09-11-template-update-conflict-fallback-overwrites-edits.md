---
id: EDS-14
kind: fix
area: eds
needs: []
value: med
status: backlog
---

# Template update falls back to a full reset on conflict, overwriting the SC's own edits

Filed 2026-09-11 while designing shared demos ([[EDS-13]]); pre-existing, applies to every
shipped storefront today.

`templateSyncService.ts` (header, and `mergeFromTemplate` at `:159`) applies a template
update as a git merge that keeps `fstab.yaml` and `config.json`, and "falls back to reset
if conflicts detected", which its own comment describes as "loses customizations". The
project's second principle says a user's own edits are never overwritten; a conflict is
exactly the case where the SC HAS edited the region. The fallback turns the one situation
that needs a human into the one situation that silently destroys their work.

Shared demos (EDS-13a) route more updates through this path, which is why it is filed now
rather than left implicit. (It was filed against forking them, D16, which was removed
2026-09-14; added demos still update through the template merge.)

## What to decide

Stop on conflict and say which files, leaving the merge for the SC to finish (or abandon)
in their repo; or offer reset as an explicit second choice with the file list in the
dialog. Never fall back silently. The update picker already confirms once; a conflict needs
its own confirmation.

## Where

`src/features/updates/services/templateSyncService.ts`; the apply path in
`updateApplyService.ts` / `updateExecutor.ts`; the picker copy in `updateTypes.ts`.
