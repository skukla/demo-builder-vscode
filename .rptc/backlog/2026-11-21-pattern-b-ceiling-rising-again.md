---
id: PL-121
kind: chore
area: platform
parent: PL-13
needs: []
value: low
status: backlog
---

# The Pattern B sendMessage ceiling rose; nothing brings it down

Filed 2026-11-21 from the backlog reconciliation. PL-13 left `patternBSendMessageCeiling` as "lower it
when you touch it" (2026-09-08). It has risen from 142 to 145 since, and no item drives it.

Pattern B: a handler answers by returning its result, and `sendMessage` is for progress only.

Done when the three added sites are converted (or each recorded with why it must push), and the
ceiling is back to 142 or lower.
