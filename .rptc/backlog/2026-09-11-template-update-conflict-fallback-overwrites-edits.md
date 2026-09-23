---
id: EDS-14
kind: fix
area: eds
needs: []
value: med
status: active
---

# Template update falls back to a full reset on conflict, overwriting the SC's own edits

Filed 2026-09-11 while designing shared demos ([[EDS-13]], on the `feature/colleague-storefront`
branch); pre-existing, applies to every shipped storefront today. Fixed on its own branch
`fix/template-update-conflict` so it can ship ahead of the shared-demo work.

`templateSyncService.ts` (header, and `mergeFromTemplate` at `:159`) applies a template
update as a git merge that keeps `fstab.yaml` and `config.json`, and "falls back to reset
if conflicts detected", which its own comment describes as "loses customizations". The
project's second principle says a user's own edits are never overwritten; a conflict is
exactly the case where the SC HAS edited the region. The fallback turns the one situation
that needs a human into the one situation that silently destroys their work.

Shared demos (EDS-13a) route more updates through this path, which is why it is filed now
rather than left implicit. (It was filed against forking them, D16, which was removed
2026-09-14; added demos still update through the template merge.)

## Decided (2026-09-14)

Both halves of the second option. The sync service stops on conflict: it aborts the merge,
pushes nothing, and fails with the file list. The Check Updates command then shows a modal
naming the files with one button, "Reset to template", and Cancel keeps the storefront as
it is. The agent tool `apply_updates` reports the files and changes nothing unless called
with `resetTemplateOnConflict:true`. Nothing falls back silently anywhere.

## Where

`src/features/updates/services/templateSyncService.ts`; the apply path in
`updateApplyService.ts` / `updateExecutor.ts`; the picker copy in `updateTypes.ts`.

## Shipped so far

- 2026-09-14  fix(updates): a template merge that conflicts stops instead of resetting (`52d7df149`)
- 2026-09-15  fix(updates): a template update applies from the recorded version, not a git merge (`5d805a57a`)
- 2026-09-15  Merge fix/template-update-conflict: a template update stops on a conflict and applies from the recorded version (`9dbdfbaa7`)
