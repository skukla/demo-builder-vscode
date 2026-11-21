---
id: PL-111
kind: chore
area: platform
needs: []
value: med
status: backlog
---

# Live checks and decisions the owner owes, from the 2026-11-21 reconciliation

Filed 2026-11-21. The reconciliation read every finished item that still named work (PL-99) and
found these remainders that only the owner can settle: a live run against real Adobe, GitHub or
DA.live resources, or a product decision. Each finished item now points here instead of reading as
open work. Tick a row by running it (or waiving it) and logging the result on the item it names.

Open items whose last step is a live check keep that step in their own log; they are not repeated
here (AI-12, EDS-39, EDS-41, PL-76, EDS-56, EDS-57, EDS-72, PL-103, AB-9, PL-70).

## Live runs

| From | Check |
|---|---|
| EDS-20, EDS-23 | A new storefront repo outside the Code Sync install: install the App while the dialog is up, and setup finishes in the same run |
| AB-16j | `mcp-live-probe` on a running ERP project: `get_erp_settings` and `set_erp_settings` reach the same state as the Admin Settings tab |
| AI-11 | One `create_project` with a store scope on a Cloud Service endpoint |
| AB-46 | Re-check Catalog Price Scope = Website on the current store (Bodea is gone), then an EU-only discount shows on the EU site's cart only |
| AB-44 | An ERP fill on Tailspin, then read the ERP's price groups |
| AB-49 | One live shipment, made with no warehouse, for products in two warehouses |
| AB-70 | Tailspin's 278 ERP products are sellable again (one `get_erp_status`); adding an ERP and changing a product's ERP tag, live |
| AB-19, AB-20 | Live placement: a shortfall shows its date on the parts page, an over-limit order is refused then goes through after the limit is raised, and a down ERP still places the order |
| AB-6 | One supervised `delete_event_provider` run, ending an ERP journey at zero |
| PL-56d | What a second App Management association to the same instance, from another workspace, does |
| PL-53 | Open the surfaces in the Extension Dev Host and look for a class applied from outside the repo's code |
| AI-2d | Read ten tagged and untagged debug-log lines and confirm the tag format reads fine |

## Decisions

| From | Decision |
|---|---|
| AB-26h | Gap G2: is Move stock the answer, or must an Admin edit of a non-default source's quantity reach the ERP? |
| AB-26h | Gap G3: confirm the credit exposure rule counts unpaid invoices (AB-26s implies yes) |
| EDS-24 | The Demo Builder block library is still off by default; its first live run passed, so on or off? |
| AB-29 | Does export-before-delete belong on `write_commerce_rest`, or stay the caller's job? |
| AB-19 | The demo scene for promised delivery dates: write its script, or drop it |
| AB-26g | Ask for SalesOrderChainApi on the instance, so a REST or agent hold works (`orderChain/{id}/hold` answers 400 without it) |
| AI-1q | The `select_*` tools are marked read-only on purpose (`adobeTools.ts`, lines 244-247): keep that, or change it |
| PL-47 | Your private `~/.claude/CLAUDE.md` still asks for Core Web Vitals checks on frontend work; the repo's no longer does. Keep or drop the line |
