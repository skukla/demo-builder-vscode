---
id: AB-30
kind: feature
area: app-builder
needs: []
value: med
status: backlog
---

# The ERP integration's Commerce Admin page uses the Commerce back-office design system

Filed 2026-09-24 (owner: the integration's page inside Commerce Admin must "work and look as
it should" and "use the same design system that the Commerce back office uses").

## What this asks

The integration ships an Admin page (App Management's Admin UI SDK, `src/commerce-backend-ui-2`
in `skukla/commerce-erp-integration`): Mapping, Status & sync, Follow an order, What crossed.
It is rendered inside the Commerce Admin, so it must read as part of it: the Admin's type,
spacing, controls, tables, colours, states — not a React Spectrum page dropped into a frame.

## Facts to establish first (none proven yet)

- Which design system Commerce Admin (ACCS, 2026) actually uses for App Management pages and
  what the Admin UI SDK provides for it (Spectrum? the Admin's own Luma/backend theme? a
  component set the SDK ships?). Read the SDK docs and an Adobe-built App Management app
  before deciding; the answer decides whether this is a restyle or a component swap.
- What the page looks like today on a real Admin (AB-26m's handoff: nobody has looked with
  records present). Screenshots of each tab beside a native Admin screen.
- Whether the page's states (loading, refused sign-in, empty, error) match the Admin's.

## Done when

Each tab screenshotted on the real Admin beside a native screen, with a written list of
every visible difference and each one either fixed or accepted with a reason. Headless
fingerprints alone do not close this; the owner looks.

## Related

AB-26 (the ERP programme), AB-26m (the Mapping tab handoff), AB-26u (the walk-through).
