---
id: AB-16k
kind: question
area: app-builder
needs: []
value: high
status: open
parent: AB-16
---

# Two Admin-page designs diverge: shipped tabs vs the §5b side-list prototype

Filed 2026-09-28 (overnight loop), validating [[AB-16c]]'s "`preview/next` has one hard-coded
ERP" gap. The gap is real, but it sits under an unresolved design question, so the loop filed
the question instead of polishing a prototype that may be superseded.

## The divergence

Two Admin-page designs exist in `commerce-erp-integration`, and they disagree on shape:

- **Shipped and live on Bodea** (`preview/main.jsx` → `src/commerce-backend-ui-2`, deployed
  2026-09-28): a **tab strip** — Overview · Activity · Settings · **Data Map** — multi-ERP
  throughout (a band with a chip per ERP, per-ERP cards, per-ERP Activity filter). This is
  today's owner-directed redesign.
- **`preview/next/` prototype** (commits `740e0a8`, `39d8ec9`, 2026-09-27): the §5b design in
  `.rptc/plans/several-erps/overview.md` — a header plus a **side list of sections** (Overview =
  the read-only mapping, **Credit**, Activity, Settings), and it is **hard-coded to one ERP**
  (`preview/next/data.js` `ERP = { name: "Northwind ERP", … }`).

They differ on the frame (tabs vs side-list), on sections (the shipped page has a **Data Map**
tab; the prototype has a dedicated **Credit** section the shipped page does not), and on ERP
count (shipped is multi-ERP; the prototype is single-ERP).

## The question (owner owns this)

Which is canonical now? Options:
1. **The shipped tabbed page is canonical; retire `preview/next` and the §5b side-list plan**
   (fold its one distinct idea — a dedicated Credit section — into the shipped page as a later
   item if wanted). *Loop's recommendation: it is what shipped today at your direction and is
   live; a divergent prototype left standing is the exact drift `architecture-duplication-scan`
   exists to catch.*
2. Keep pursuing the §5b side-list design; treat the shipped tabs as interim.
3. Merge: adopt the shipped tabs but add the Credit section from §5b.

## Consequence / why this blocks AB-16c

AB-16c's `preview/next` "one hard-coded ERP" fix is **deferred** until this is answered — making
a superseded prototype multi-ERP is wasted work; if the prototype survives, the fix comes free
with whichever slice makes it multi-ERP. §5b of the several-erps plan should be reconciled with
whatever is decided.

## Shipped so far

- 2026-09-28  docs(loop): file AB-16k — Admin-page design divergence (tabs vs §5b side-list) (`2ee11706a`)
- 2026-09-29  Owner confirmed the shipped tabbed page is canonical (the Examples Data Map shipped as a tab within it). Remaining: retire the preview/next §5b prototype — git rm blocked by the local-destruction guard, awaiting owner OK to delete preview/next/ + preview/next.html + the package.json source line.
