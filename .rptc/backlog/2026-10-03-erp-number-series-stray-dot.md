---
id: AB-65
kind: fix
area: app-builder
needs: []
value: low
status: backlog
parent: AB-26
---

# A stray dot after the first editable number in the ERP's Number Series table

Seen 2026-10-02 in the ERP preview (Settings › Number Series): a small dot sits just after the
Sales orders row's Next number (0000001010 ·), in the first row only. Measured: it lies between
the edit button's right edge and its table cell's edge (demo-erp
screen/src/components/SetupNumberSeries.js, EditableText inside a Spectrum TableView). Not the
save spinner (SavingValue renders nothing when not saving) and not page focus (the active element
was the body). Likely a TableView focus marker on the first interactive cell; unproven.
