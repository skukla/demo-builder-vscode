---
id: AI-80
kind: feature
area: ai
parent: AB-1d
needs: []
value: low
status: backlog
---

# Debug log search can match several words at once

Filed 2026-11-21 from the backlog reconciliation (AB-1d suggested it; no item carried it).

`read_debug_logs` filters with one lowercase substring (`diagnosticsTools.ts`, lines 148-151). An
agent tracing one operation across channels needs several terms (an id and an error word), so it
calls the tool several times or reads everything.

Done when the filter takes several terms (any or all), with the tool's description saying so.
