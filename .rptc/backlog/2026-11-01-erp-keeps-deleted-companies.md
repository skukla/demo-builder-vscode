---
id: AB-84
kind: fix
area: app-builder
needs: []
value: med
status: backlog
---

# Deleting a company leaves it in the ERP

Found 2026-11-01. A company created on a Commerce instance with an ERP integration becomes an ERP customer,
even from another website on that instance. Deleting the company in Commerce leaves the customer behind, and
products reach the ERP the same way.

Measured on Justrite's ERP after live tests that removed everything on the Commerce side: customers C27 to C34
and products `zz-aco-buyer-1` and `-2` remain, all test records. That breaks "whatever can be done can be undone".

Also measured: a company the ERP gives no credit cannot check out by any payment method, and the shopper reads
only "An unexpected error occurred". The refusal is `Credit limit USD 0.00 exceeded`, and the credit limit in
Commerce does not change it, because the ERP's own record decides.

## To decide

Whether deleting a company should reach the ERP, and how to clear these records. `reset_erp_records` resets the
whole ERP, so it is not the tool for removing a few.

## Measured when removing them, 2026-11-01

The deployed ERP answered 404 to `DELETE products/<sku>`. That route exists in `demo-erp`'s newer undeployed code,
and customers have no delete route in either. Commerce's delete of those products did not reach the ERP either. So
none of the records could be removed without a redeploy or a full reset, and the owner chose to leave them until a
proper route exists.
