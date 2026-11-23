---
id: PL-108
kind: feature
area: platform
needs: []
value: med
status: backlog
---

# Build the nine accepted reflect proposals that are Demo Builder's

Filed 2026-11-20. The owner accepted 15 reflect proposals on 2026-11-16 or earlier; none is built.
The dev-pipeline thread sorted them: six belong to the pipeline (R-2, R-22, R-61, R-75, R-93,
R-229), nine to this repo:

| Id | Kind | What |
|---|---|---|
| R-17 | tool | live-probe mode that waits until the server is serving |
| R-45 | tool | `checks quick`: tsc, test typecheck and eslint on changed files |
| R-46 | tool | `checks test`: run jest files, print the summary and the failing blocks |
| R-47 | tool | `checks mutate`: apply a mutation, run the test, always restore |
| R-52 | hook | tell delegated sub-agents which skill gates their files will hit |
| R-54 | guard | a SOP test that fails on UI wording the owner has rejected |
| R-64 | tool | a file-limits tool reusing the god-file ratchet |
| R-81 | rule | present each redone mockup next to the item it illustrates |
| R-118 | rule | when the owner says think, discuss or asks a question, answer before building |

The proposals tool (`proposals list`) is the record; each closes from a commit carrying
`Reflect: R-N`. R-118 may already be met by the memory rule "Think About It Means Discuss";
check, and close it with a commit that says so if it is.

## Shipped so far

- 2026-11-20  docs(backlog): file the pipeline review's Demo Builder items (`2d3fa91a7`)
