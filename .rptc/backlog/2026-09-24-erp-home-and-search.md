---
id: AB-26l
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26i]
value: med
status: built
---

# Home as a work list, rail counts, the journal naming documents, global search

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 1.**

## What

`erp-screen-realism` slice 7 / §3.1 and the UI audit: Home replaces Dashboard with work cues that open filtered lists (orders to confirm / ship / invoice / on credit hold; events failed); counts on rail items; the event journal names the document each entry belongs to and refreshes live; a search in the shell bar that opens any document.

## Verification block (checked by the loop's done gate — §6a of the plan)

Health/structure answer the cue counts (tested); headless checks on Home and the journal; a cue's count equals the filtered list's length in the preview.

## Shipped so far
- 2026-09-24  BUILT — demo-erp 5b2a269: Home work list (8 cues counted by lib/work from the documents' abilities, each opening its list filtered via #list?work=…), rail counts, shell-bar search (actions/search, lib/search; opens any document via #list?open=…), journal sentences (lib/journal) with document links and an 8s self-refresh; 223 tests, 13 headless screen checks incl. cue-count-equals-list-rows, rail-counts-equal-cues, search-opens-document, journal-names-documents; contract gains the search route (integration 8a313fd). Two Spectrum ComboBox facts read in its source and recorded in ShellSearch.js (no controlled isOpen; loader never clears). Not done: none of the slice's scope; UI-1's remaining piece is the sticky document title line
