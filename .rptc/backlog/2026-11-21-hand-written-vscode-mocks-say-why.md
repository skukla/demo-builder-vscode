---
id: PL-114
kind: chore
area: platform
parent: PL-38
needs: []
value: low
status: backlog
---

# Every hand-written vscode mock says why the shared one is not enough, or is deleted

Filed 2026-11-21 from the backlog reconciliation. PL-38 left 34 suites that replace the shared vscode
mock "for a reason nobody wrote down"; no item carried them.

On 2026-11-21, 45 test files carry their own `jest.mock('vscode', ...)`, up from 34.

Done when each one either uses the shared mock or says in a comment what the shared one cannot do,
and a rule check keeps a new one from appearing without that comment.
