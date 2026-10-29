---
id: PL-79
kind: feature
area: platform
needs: [PL-75]
value: med
status: backlog
---

# Edit switches a project's stack

Filed 2026-10-13 by the owner, who wants it built before the release. One of four
switches PL-75 left locked in Edit because no operation exists for them (see
`.rptc/plans/edit-applies-only-what-changed/overview.md`). Covers the headless package
change too, which PL-75 also locks.

## How it would work

A stack is a frontend and backend pair (`components/config/stacks.json`), so switching
it (for example Edge Delivery to headless) swaps the whole frontend:

1. Install the new frontend in the project.
2. If the backend changes with it, run PL-78's backend switch.
3. Ask whether to tear down the old storefront (an Edge Delivery repository and site) or
   keep it, through EDS-42's delete step.
4. Record the new stack on the project.

The undo is switching back, which only fully works if the old storefront was kept.

## Known so far

- Close to building a new project in place; the largest of the four (an estimate).
- A headless package change cannot use reset: headless reset re-clones the frontend from
  the SAVED repository URL (`lifecycle/services/projectResetService.ts:184`).
- Waits on PL-75's apply path. Shares steps with PL-78 and EDS-42, so build those first.
