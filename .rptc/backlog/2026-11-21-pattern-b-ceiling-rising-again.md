---
id: PL-121
kind: chore
area: platform
parent: PL-13
needs: []
value: low
status: dropped
---

# The Pattern B sendMessage ceiling rose; nothing brings it down

Filed 2026-11-21 from the backlog reconciliation. PL-13 left `patternBSendMessageCeiling` as "lower it
when you touch it" (2026-09-08). It has risen from 142 to 145 since, and no item drives it.

Pattern B: a handler answers by returning its result, and `sendMessage` is for progress only.

Done when the three added sites are converted (or each recorded with why it must push), and the
ceiling is back to 142 or lower.

## Shipped so far

- 2026-11-23  Loop 2026-11-23: checked. The ceiling is 145 and every raise since 142 is already recorded with its reason in architecture-rules.exemptions.json: updateRowStatus (Updates apply, 2026-10-21), projectsBatchRow (Reset/Delete Selected, 2026-11-04), storefront-setup-progress from storefrontSetupBundle.ts (EDS-72, 2026-11-18). All three are progress lines during a long run, which is what Pattern B keeps sendMessage for; each run still returns its outcome. So the item's first condition (each recorded with why it must push) is met, and its second (back to 142) would need converting progress pushes into results, against the rule. Owner decision: recommend closing as done by the records; nothing changed.
- 2026-11-23  Owner 2026-11-23: closed. Each raise since 142 is recorded with its reason (all progress lines during long runs), which meets the item's first condition; lowering the ceiling would mean breaking the rule.
