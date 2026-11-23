---
id: AI-80
kind: feature
area: ai
parent: AB-1d
needs: []
value: low
status: built
---

# Debug log search can match several words at once

Filed 2026-11-21 from the backlog reconciliation (AB-1d suggested it; no item carried it).

`read_debug_logs` filters with one lowercase substring (`diagnosticsTools.ts`, lines 148-151). An
agent tracing one operation across channels needs several terms (an id and an error word), so it
calls the tool several times or reads everything.

Done when the filter takes several terms (any or all), with the tool's description saying so.

## Shipped so far

- 2026-11-23  Loop 2026-11-23: built (cf56b1076, on loop/2026-11-23-backlog): filter takes a string or up to ten terms, matchAll for every term, echoed terms counted against the byte budget. Reviewed (opus, 2 low findings fixed). Live check after merge: the running build is develop's.
