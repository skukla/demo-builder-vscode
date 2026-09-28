# ERP night loop — 2026-09-28 (owner asleep)

Running report, updated at every step. Plain English. Newest at the bottom of "Progress".

## The plan
1. Event check: does the order event carry the per-line nominated warehouse? Then clean up Bodea.
2. B6 — "Add another ERP" in Demo Builder (+ agent tool, + setup checklist steps).
3. B7 — the integration's Admin page: each order's parts per ERP, Re-send, several-ERP header.
4. B8 — live on Bodea: merge to main, deploy, add a second ERP, brands and owning ERPs on a few products, the vignettes with test orders, clean up.
5. Live check journeys for every entity.
6. If time: credit memo + repeat order (AB-26r); returns across ERPs as a design only; Phase C1 screen listing (no visual changes).

## Rules
Full tests before every commit. Bodea only; never signs in; never deletes a workspace or project. A deploy or live test that fails twice stops that item.

## Progress
- Loop started. Event-check deploy running; B6 being built.
