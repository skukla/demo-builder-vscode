---
id: EDS-84
kind: fix
area: eds
needs: []
value: low
status: backlog
---

# Isle5's pop-up links throw an error

Filed 2026-11-24, found while writing the shipped block examples (EDS-71).

`scripts/commerce.js` in `stephen-garner-adobe/isle5` (commit `b1065ca`, lines 828 to 829) opens a
link to a `/modals/` page with `const { openModal } = await import('.../blocks/modal/modal.js')`
and then calls `openModal(...)`. `blocks/modal/modal.js` exports only a default
`createModal(contentNodes)` (line 4), so `openModal` is undefined and the click throws instead of
opening the dialog.

The repo is not ours, so this is a report to its owner: import the default and pass it the
fragment's content, or export an `openModal` from the modal block.
