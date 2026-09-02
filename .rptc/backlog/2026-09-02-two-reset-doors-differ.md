---
id: EDS-12
kind: fix
area: eds
needs: []
value: med
status: backlog
---

# Resetting the same EDS project does less from the dashboard than from the projects list

There are two `handleResetProject` implementations, one per surface, and they
call the same primitive with different options:

| | dashboard | projects list |
|---|---|---|
| where | `src/features/dashboard/handlers/projectManagementHandlers.ts:78` | `src/features/projects-dashboard/handlers/dashboardHandlers.ts:811` |
| finds the project by | `stateManager.getCurrentProject()` | `resolveProjectFromPath(payload.projectPath)` |
| `includeBlockLibrary` | **not passed → false** | `true` |
| `verifyCdn` | **not passed → false** | `true` |
| `showLogsOnError` | **not passed → false** | `true` |

Everything else is the same: both branch on `isEdsProject`, both dynamically
import `resetEdsProjectWithUI` for EDS projects and `resetProjectWithUI`
otherwise, both build the same `meshDeps`. The defaults are declared at
`src/features/eds/services/reset/edsResetUI.ts:367-370`.

So one demo, reset two ways, ends up in two different states: the projects-list
reset restores the block library configuration and verifies the CDN afterwards;
the dashboard reset does neither, and hides the "Show Logs" button when it
fails.

## Is this deliberate?

Unknown, and that is the decision this item is asking for. Nothing in either
file says why. Two readings are both plausible:

1. **Oversight.** The projects-list handler grew the three options later and
   nobody went back to the dashboard one. The fix is three lines.
2. **Deliberate.** The dashboard reset is meant to be the lighter one, and the
   heavier reset belongs on the list where an SC is managing many projects.

The repo's reversibility rule leans toward (1): "whatever can be done can be
undone", and a reset that leaves the block library configuration behind has not
returned the project to zero.

## Found how

The clone ledger paired the two suites that test these handlers —
`tests/features/dashboard/handlers/dashboardHandlers-eds.test.ts` and
`tests/features/projects-dashboard/handlers/dashboardHandlers-dalive-auth.test.ts`
— on 35 duplicated lines. They share a 13-module mock wall, the same project
fixture and four identically-named tests, because they test two copies of one
handler. The test duplication is a SYMPTOM; collapsing it would have hidden the
finding, so that pair is adjudicated in the clone ledger rather than merged.

Neither suite asserts on the three options in a way that would fail if a door
changed, which is why the difference had gone unnoticed.

## Related

- `call-path-audit` — this is exactly its question: does "reset a project" have
  one definitive path? Today it has two, and they behave differently.
- [[PL-35]] — the other finding from the same pair of suites.
- [[PL-9]] — the burn-down that surfaced it.
