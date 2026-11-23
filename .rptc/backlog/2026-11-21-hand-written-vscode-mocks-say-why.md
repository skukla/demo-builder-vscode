---
id: PL-114
kind: chore
area: platform
parent: PL-38
needs: []
value: low
status: built
---

# Every hand-written vscode mock says why the shared one is not enough, or is deleted

Filed 2026-11-21 from the backlog reconciliation. PL-38 left 34 suites that replace the shared vscode
mock "for a reason nobody wrote down"; no item carried them.

On 2026-11-21, 45 test files carry their own `jest.mock('vscode', ...)`, up from 34.

Done when each one either uses the shared mock or says in a comment what the shared one cannot do,
and a rule check keeps a new one from appearing without that comment.

## Shipped so far

- 2026-11-23  Loop 2026-11-23: built (2ac3f0a8b, on loop/2026-11-23-backlog). 56 files had their own vscode factory: 7 now use the shared mock, 49 carry an 'Own vscode mock:' reason. New enforcer tests/sop/own-vscode-mocks-say-why.test.ts reads whole files (multi-line, doMock, any quote) with controls. Two opus reviews: the first caught 17 missed multi-line factories, a deleted variable two suites still used (tsc failure) and wrong reasons; all fixed and re-reviewed. Counts in CLAUDE.md, CONTRIBUTING.md and the handbook moved to 74 suites, 149/146 conventions.
