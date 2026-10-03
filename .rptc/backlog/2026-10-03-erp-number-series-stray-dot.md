---
id: AB-65
kind: fix
area: app-builder
needs: []
value: low
status: built
parent: AB-26
---

# A stray dot after the first editable number in the ERP's Number Series table

Seen 2026-10-02 in the ERP preview (Settings › Number Series): a small dot sits just after the
Sales orders row's Next number (0000001010 ·), in the first row only. Measured: it lies between
the edit button's right edge and its table cell's edge (demo-erp
screen/src/components/SetupNumberSeries.js, EditableText inside a Spectrum TableView). Not the
save spinner (SavingValue renders nothing when not saving) and not page focus (the active element
was the body). Likely a TableView focus marker on the first interactive cell; unproven.

## Shipped so far

- 2026-10-03  Fixed 2026-10-03: the dot was the first dot of a clipped ellipsis — the Next no. column was 140 px and a ten-digit number needs up to 113 (demo-erp 86f3430; a screen test asserts no clipped cell). The same measure flags Customers 'Edit credit limit' and Settings 'Edit sales organization' buttons: not checked visually.
