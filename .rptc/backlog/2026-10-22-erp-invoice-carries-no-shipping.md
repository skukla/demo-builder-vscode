---
id: AB-81
kind: fix
area: app-builder
needs: []
value: med
status: backlog
---

# An order paid on account leaves the buyer short by its shipping

Filed 2026-10-22 from release-test row 5.3. First noticed 2026-10-02 and recorded only
as a "known gap" in AB-26s's log ("shipping belongs to no ERP part, so it has no ERP
open item"), where nothing would bring it back up.

## What happens

Measured live on Justrite, order 5000000025 (Northgate Industrial Supply, Payment on
Account, one sign at 21.21 plus 5.00 flat-rate shipping):

| When | Northgate's credit balance | Change |
|---|---|---|
| Before | −29,516.64 | |
| Order placed | −29,542.85 | −26.21 |
| Paid in Justrite ERP (payment 7000000003, invoice 9000000014) | −29,521.64 | +21.21 |

Commerce marks the order complete and paid 26.21; the company's credit is 5.00 lower
than before the order. The ERP's invoice holds only the product lines, so its payment
reimburses only those. Every on-account order loses its shipping this way.

## The decision it needs

When an order is split across ERPs, which ERP invoices the shipping? Recommendation:
the ERP that holds the order's first line (the same order the split already uses),
shown as its own invoice line, so its payment carries it back. Alternatives: the ERP
that ships first (not known when invoicing a part that has not shipped), or a share per
ERP (real ERPs do not split freight this way).

Code: demo-erp's invoice (`lib/fulfilment.js`, behind `actions/orders/index.js`) and the integration's order split, which
today sends each ERP its lines and no shipping.
