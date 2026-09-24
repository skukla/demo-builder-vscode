# Step 04 — What the audience sees

1. Settings → **Organisation** card (read-only): company code line (code, ERP name, currency,
   country, VAT from the website mapped to `1000`), sales organisations with website code and
   counts, warehouses with ERP name → Commerce name, and an `unmapped` warning line per
   website with no sales org ("Website `eu` has no sales organisation; its orders use 1000
   — set one on the integration's Admin page").
2. Settings → **Warehouses**: the ERP name editable in place (`EditableText`), Commerce code
   and name read-only.
3. Order header: "Sales organisation 2000 · Online EU" from the order, not the customer.
4. Customer document: "Sold-to in 1000 · Online US, 2000 · Online EU"; legal name, VAT/Tax
   ID, reseller ID, legal address on the header card (absent fields print a dash, the card is
   never hidden — a company always has a legal identity).
5. Shipment: "Ship-from Plant 1100 · Newark DC (east)" — the ERP name, code in brackets;
   Shipments list the same.
6. Invoice header: seller block (P3) — the mapped website's Store Information.
7. Pricing Rules: optional "Sales organisation" picker in the Add dialog (All / one of the
   known ones) and a column; Test a Price takes one.
8. `preview/fakeApi.js`: mirrors every shape above (it is the harness the screens are
   looked at in); `Documents.js` unchanged.

## Done when

Screen builds under budget; every screen above looked at in the preview with the stand-in
records including one unmapped website; no `1000` appears that is not a real sales
organisation code.
