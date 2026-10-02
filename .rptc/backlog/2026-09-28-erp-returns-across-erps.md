---
id: AB-16e
kind: feature
area: app-builder
parent: AB-16
needs: []
value: med
status: built
---

# Returns across several ERPs

Filed 2026-09-28. The owner decided returns come after routing (2026-09-27). The design is
written and waits for the owner's review: `.rptc/plans/several-erps/returns-design.md`
(slices R0 to R6, each with a done-when line).

## The recommendation, in short

The buyer asks for one return in Commerce and staff authorise it there; the integration splits
it by the order's parts record, each ERP credits only its own lines, and Commerce gets one
credit memo per ERP. A refusing ERP's piece stays open with Re-send.

## To settle first (slice R0, live tests)

- The design's author reports that Commerce's REST reference lists return endpoints
  (`/V1/returns`); the locked design v1 §3.4 says none exist. Listed, not tried live.
- No event for a saved or authorised return has been found.
- A credit memo cannot be deleted, so a demo reset cannot undo one: a reversibility finding.
- The owner and client questions listed in the design.

## Shipped so far

- 2026-09-28  2026-09-28 design r1 APPROVED by the owner (returns-design.md, 'r1: the integrated flow'): the owning ERP's policy authorizes or denies lines, the integration moves the return's status, a carrier label on authorization, shipping refunded by rule, credit memo per ERP. Next: live tests R-T1 to R-T7 on Bodea, then slices R1-R6.
- 2026-09-28  2026-09-28 the JustRite deck carries r1 as journey step 7 (slide 42, 'Return one order, two brands'; notes say designed, not built; the tech case's question #18 carries the five client questions). When returns change, tell the case agent so the slide stays true.
- 2026-10-02  R0 reads on Justrite: the return save event exists (observer.rma_save_after), returns REST answers, storefront returns are off; recorded in returns-design.md 6.1
- 2026-10-02  Baseline live on Justrite: order 5000000002 split, confirmed, shipped from each ERP warehouse and invoiced per ERP (invoices 5000000001/2). R-T3 answered: one credit memo per ERP works, offline refund goes to company credit (credit memo 1)
- 2026-10-02  demo-erp loop/2026-10-02-order-to-return 59d7200: return orders (create, receive, credit) + contract v13; 423 tests; not yet on main or deployed
- 2026-10-02  commerce-erp-integration loop branch b74445f + a2eddfb: returns and credit memos synced both ways (1061 tests); return comment fields, partial statuses and reason labels read live and fixed; returns cannot be deleted over REST (retire by closing). Not yet on main or deployed
- 2026-10-02  Live on Justrite 2026-10-02: deployed (integration d32060e, ERPs 7f40389, app 0.11.0); order 5000000005 placed, split, shipped, invoiced, returned (one return, two ERP return orders), received and credited (two Commerce credit memos, return Processed and Closed) with no hand step. Status-write bug found live (approved item refused) and fixed (d32060e). Walkthrough steps in commerce-erp-integration docs/walkthrough.md (8a52e01)
- 2026-10-02  docs(handoff): the 2026-10-02 order-to-return loop report (`575c660cd`)
- 2026-10-02  docs(backlog): AB-16e built and proved live on Justrite; AB-56 filed (a split order re-sent on later saves) (`ac3757ba3`)
- 2026-10-02  docs(returns): a return cannot be deleted over REST; comment fields and partial statuses read live (`d14710e83`)
- 2026-10-02  docs(backlog): AB-16e/AB-26r — the mock ERP's return orders and credit memos built on the loop branch (`393e02696`)
- 2026-10-02  docs(returns): R-T2 answered live — the API sets every return status; the build plan (`919762d2d`)
- 2026-10-02  fix(commerce-rest): a DELETE sends the body it is given (`502bec122`)
- 2026-10-02  docs(returns): R-T3 answered live — one credit memo per ERP, refunded to company credit (`f0cf2780a`)
- 2026-10-02  docs(returns): R-T1 answered live — Commerce has a return save event; storefront returns are off on Justrite (`8d94bf06a`)
