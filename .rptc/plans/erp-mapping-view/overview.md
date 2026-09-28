# The integration's Mapping view, redesigned

Owner, 2026-09-28: "We need to redesign a simplified and attractive experience that visualizes
data mapping between the ERP and Commerce in the integration admin", so that a business user
understands what each of the integration's settings relates to in each system. It includes the
new price mapping (AB-26z). Backlog: AB-26m (reopened; its first Mapping tab was deleted in the
page redesign of 2026-09-27, `ec40ca5`). Look and feel: AB-30 (Commerce Admin's design
system).

## Who it is for, and the one question it answers

A merchant's business user (and the SC demoing to them), not an integrator. The question:
**"What does this setting connect, and which system decides?"** Everything on the page serves
that question; anything that does not goes to Overview or Activity.

## The shape

One section, **Mapping**, beside Overview, Credit, Activity and Settings. Commerce on the left,
the ERP on the right, one row per thing the two systems share. Each row:

- **The two names side by side**, in each system's own words ("Company" | "Customer").
- **A connector** whose arrow says who decides (ERP → Commerce, Commerce → ERP, or both), with
  one plain sentence under it ("Each company in Commerce is a customer in the ERP").
- **The settings that shape it**, as small chips on the connector, each with its scope
  (website or integration-wide) and its current value. Clicking a chip opens that setting in
  Settings (no second place to edit).
- **A live figure** where one exists ("12 of 12 companies paired", "3 price lists published").
- **Open it** for the detail: the fields matched on each side, field to field, with the owner of
  each.

With several ERPs, the page follows the ERP switcher already on Settings; a row names only that
ERP's part ("Brand B's products: erp_owner = demo-erp-2").

## The rows (in the order a business user thinks about them)

| Commerce | ERP | Who decides | Settings on the connector |
|---|---|---|---|
| Website | Sales organisation | Commerce's structure; the ERP books under it | sales organisation per website |
| Company | Customer (business partner) | Commerce owns the company; the ERP owns its credit and blocks | the pairing (key map) |
| Product | Material | ERP owns name, list price and stock; Commerce owns the rest | which products belong to this ERP |
| **Shared catalog price** | **Customer price list / price group list** (AB-26z) | ERP | none: published when a list changes; quantity breaks become tier prices; dates are followed |
| Inventory source | Warehouse | ERP | (per source) |
| Company credit | Credit limit and credit block | ERP | |
| Order | Sales order (one per ERP) | Commerce creates, the ERP fulfils | send orders, hold while offline, order-number prefix, status on confirm |
| Shipment and invoice | Delivery and billing document | ERP | |

## Principles

- Plain words; each system's own term on its own side; no internal names (no `structure_*`).
- One idea per row; the detail is one click away, never on the surface.
- Every setting shown here is the real setting, edited in one place (Settings).
- It must read as part of Commerce Admin (AB-30): type, spacing, colours and controls.

## Steps

1. **Prototype** in the integration's redesign preview (`preview/next`, sample data), for the
   owner's review. Nothing ships before that.
2. Build it into the Admin page (`src/commerce-backend-ui-2`), with the page's tests.
3. Fix the README, which still describes the deleted Mapping tab.
