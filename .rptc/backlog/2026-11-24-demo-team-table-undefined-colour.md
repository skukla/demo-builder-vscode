---
id: EDS-83
kind: fix
area: eds
needs: []
value: low
status: backlog
---

# Demo Team's Table uses a colour the template never defines

Filed 2026-11-24, found while writing the shipped block examples (EDS-71).

`blocks/table/table.css` in `demo-system-stores/accs-citisignal` (commit `31ca953`, line 60) sets a
background with `var(--light-color)`. The B2B template that Starter and CitiSignal storefronts are
built from uses that name in its own `styles/styles.css` (lines 409 to 437 at `f8eb94d`) but never
defines it, so the background is empty.

Fix in the library: use a defined colour or a `var()` fallback. The template's own use is Adobe's
and out of scope.
