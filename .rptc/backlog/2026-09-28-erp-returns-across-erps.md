---
id: AB-16e
kind: feature
area: app-builder
parent: AB-16
needs: []
value: med
status: active
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
