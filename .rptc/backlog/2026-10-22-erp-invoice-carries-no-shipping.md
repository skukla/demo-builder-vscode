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

## The design (owner, 2026-10-22)

Split the shipping with the lines. The integration already divides an order's lines
between the ERPs; it divides the shipping the same way, in proportion to each ERP's
share of the order value after discounts (value, not item count: a 500.00 item and a
5.00 item must not share freight evenly). Cents that do not divide go to the larger
part, so the shares always add up to the order's shipping exactly. An order that goes
to one ERP gives it all the shipping.

Each ERP shows its share as a Shipping line on its order and invoice, so its payment
carries it back and the payments add up to the order total. A freight line on an
invoice is a standard ERP feature (an SAP freight condition, a Business Central charge
line), so it stays within what the mock ERP models.

Rejected: the ERP holding the first line takes all of it (it would invoice freight for
a box another ERP sent); the ERP that ships first (not known when a part is invoiced
before it ships).

Also in scope: a return or credit memo that refunds shipping gives back that ERP's
share.

Timing: after the release. It changes the integration's order split, its riskiest code.

Code: demo-erp's invoice (`lib/fulfilment.js`, behind `actions/orders/index.js`) and the integration's order split, which
today sends each ERP its lines and no shipping.
