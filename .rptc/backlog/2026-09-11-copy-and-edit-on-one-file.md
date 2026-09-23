---
id: PL-56e
kind: fix
area: platform
parent: PL-56
needs: [PL-56c, PL-56d]
value: med
status: backlog
---

# Copy and Edit read the same complete file, so neither can drop what the other keeps

Filed 2026-09-11. Owner decision the same day: both modes stay. Edit is fed by the same
serializer as export (`projectManagementHandlers.ts:26`), so every field export dropped was
a field Edit's save could DELETE (the `edit-mode-removal-audit` finding). Once [[PL-56c]]
makes the file complete, this item proves Edit's Finish round-trips every travelling field
and that Copy from Existing produces the same creation wire as Import from File.

## Tests first

A round-trip test on a captured real project: Edit with no changes → save → manifest
identical in every travelling field. Copy vs Import: same file, same wire.
