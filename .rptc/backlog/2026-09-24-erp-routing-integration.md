---
id: AB-26t
kind: feature
area: app-builder
parent: AB-26
needs: [AB-16, AB-26j]
value: high
status: gated
waiting-on: the client's answers (which ERPs; does the PIM mark the owning system); owner decisions Q2 and Q-num
---

# The routing integration — one Commerce order split across ERP pairs

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 3 — design first (the seam S2/S3 on each pair, the routing app as its own catalog entry), then build.**

## What

`.rptc/research/multi-erp-order-routing/` §3: a third catalog entry beside two pairs owning the ownership map (source or attribute), the split, the dispatch through the seam (S1 stand down · S2 send this part · S3 per-part outcome · S4 who am I), the merge of two status streams onto one Commerce order, and the failure story; Admin UI SDK screens; the nine-moment demo of §10. The pairs stay generic (rule M1–M5); the routing app becomes the only order-event subscriber (owner decision Q2 pending).

## Verification block (checked by the loop's done gate — §6a of the plan)

Harness with TWO in-process ERPs behind two integration copies and one fake Commerce: a mixed order becomes two ERP orders each holding only its lines; one pair down → one part waiting, re-sent; reset → zero. Live in two scratch workspaces.

## Shipped so far
