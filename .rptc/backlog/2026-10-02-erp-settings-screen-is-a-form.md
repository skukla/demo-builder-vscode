---
id: AB-59
kind: feature
area: app-builder
parent: AB-26
needs: []
value: med
status: open
---

# The ERP's Settings screen should be settings: a form an ERP user edits, not panels of text

Owner, 2026-10-02: "What you regard as 'settings' do not look like Settings to me. They look
like panels that have a lot of text on them rather than settings an end user sets."

## What the screen is today (demo-erp preview, `#settings`, read 2026-10-02)

Five cards, almost none of them a setting:

| Card | What it is | Real ERP? |
|---|---|---|
| Records | A paragraph about Demo Builder filling the ERP, and "Wipe all records" | No: demo control, names Demo Builder |
| Maintenance | A paragraph, minutes, "Start maintenance" | No: a demo control (simulate downtime) |
| Document numbering | Next numbers per document type, read-only, plus a paragraph | Half: real ERPs have number series, editable |
| Organization | Company code and sales organizations, read-only | Half: real, but read-only and prose-shaped |
| Appearance | Theme and colour of the ERP's screen | No: our demo's look |

## Direction (recommendation, for the owner)

1. **Demo controls leave the ERP.** Wipe, maintenance (simulated downtime) and appearance are
   Demo Builder's, on the ERP's card, beside Reset ERPs and Fill from Commerce. Wipe is
   already inside Reset ERPs; the standalone button goes (with AB-26y's question 1).
2. **What stays is a setup form, shaped like Business Central's setup pages** (Company
   Information; Sales & Receivables Setup; Inventory Setup) or SAP's configuration apps:
   labelled fields with controls, grouped in sections, a one-line hint per field, Edit / Save /
   Cancel, and no paragraphs.
   - **Company**: name, address, tax ID, currency, company code (editable).
   - **Sales & receivables**: default payment terms; credit warnings (credit limit /
     overdue balance / both / none); return reason codes; and, with AB-26s, how payments are
     applied.
   - **Number series**: one row per document type (sales order, shipment, invoice, credit
     memo, return order, price list) with its starting number and next number, editable
     forward only (a series never rewinds).
   - **Sales organizations**: a table (code, name, currency, website it serves) with Add /
     Edit, which AB-26y's step 2 already wants the ERP to own.
3. Only real, standard ERP settings (the owner's rule); each must change behaviour somewhere.

## Open

- Owner: agree the split (demo controls to Demo Builder) and the four sections.
- Which fields are editable on day one (a field the ERP does not act on is not a setting).

## Shipped so far
