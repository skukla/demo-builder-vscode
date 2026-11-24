---
id: EDS-81
kind: fix
area: eds
needs: []
value: low
status: backlog
---

# Four Bodea blocks carry wording authors cannot change

Filed 2026-11-24, found while writing the shipped block examples (EDS-71).

These blocks in `skukla/bodea-source` (commit `2fd511e`) write text from their code, so whatever an
author types, that text still shows:

- `hero-5.js`: "Trusted by enterprise teams globally" (line 181) and a dashboard card titled with
  another company's name (line 197).
- `hero-6.js`: "Platform metrics" and its stats (line 388).
- `guided-selling-luxe.js`: the advisor's intro about server racks (line 324).
- `triptych.js`: three fixed lines naming another brand (lines 14 to 16).

The library is offered only to Bodea storefronts (`block-libraries.json`, `onlyForPackages`), so the
wording may be meant for that demo. It still stops an SC from reusing the block for a customer.
Fix in `bodea-source`: read the text from the block's table, keeping today's wording as the
default when a cell is empty.
