---
id: AB-26t
kind: feature
area: app-builder
parent: AB-26
needs: [AB-16, AB-26j]
value: high
status: gated
waiting-on: the order-attributes validation for Q-num (a credential). Q2 and S1 are decided; AB-16 still blocks
---

# The routing integration — one Commerce order split across ERP pairs

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 3 — design first (the seam S2/S3 on each pair, the routing app as its own catalog entry), then build.**

## What

`.rptc/research/multi-erp-order-routing/` §3: a third catalog entry beside two pairs owning the ownership map (source or attribute), the split, the dispatch through the seam (S1 stand down · S2 send this part · S3 per-part outcome · S4 who am I), the merge of two status streams onto one Commerce order, and the failure story; Admin UI SDK screens; the nine-moment demo of §10. The pairs stay generic (rule M1–M5); the routing app becomes the only order-event subscriber (owner decision Q2 pending).

## Verification block (checked by the loop's done gate — §6a of the plan)

Harness with TWO in-process ERPs behind two integration copies and one fake Commerce: a mixed order becomes two ERP orders each holding only its lines; one pair down → one part waiting, re-sent; reset → zero. Live in two scratch workspaces.

## Shipped so far

- 2026-09-24  S1 decided by the owner: the ERPs may never be known and the demo does not model a PIM; the `erp_owner`-style product attribute (ownership mode `attribute`) is the solve, and the story says a PIM would write it into Commerce. Q-num: investigate custom order attributes (ACCS, SaaS-only) as the home for each ERP's number; recorded in the plan §8. Q2 explained; confirmation pending
- 2026-09-24  Q2 decided by the owner: only the routing integration subscribes to Commerce's order event. Named as the pattern to relay to the customer: one consumer action routes each order's parts to the owning ERP's runtime actions and events; the pairs stay generic (routing research §12)
- 2026-09-24  docs(rptc): Q2 decided — only the routing integration subscribes; the consumer pattern to relay (`1f6239172`)
- 2026-09-24  2026-09-24, owner asked whether routing is its own piece or namespaced actions inside the ERP integration: reaffirmed as its own integration (programme §6, research §3). Reasons recorded: App Management subscribes per app, so routing inside the pair would make one copy the master by a setting (breaks M1); single-ERP SCs would carry routing code; a separate router can reach targets other than our pair; the swap-for-an-OMS story needs one place. Shared CODE (Commerce client, structure helpers, history shapes) becomes a library both apps depend on; the pair gains only seams S2 and S3. Catalog: a third integration entry in its own workspace, requiring two or more pairs
- 2026-09-24  docs(backlog): routing stays its own integration — the reasons, re-asked and reaffirmed (`e0ff70d16`)
