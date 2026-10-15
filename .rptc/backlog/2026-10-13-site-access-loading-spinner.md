---
id: EDS-41
kind: fix
area: eds
needs: []
value: low
status: active
---

# The Site Access screen's loading spinner matches the rest of the extension

Filed 2026-10-13 by the owner: "In the manage DA live screen we added, the spinner that
loads the screen is not consistent with the rest of the extension."

## What is known

- Once the screen is open it already uses the house `LoadingDisplay` for its own work
  (`src/features/eds/ui/siteAccess/SiteAccessScreen.tsx:133`). So the odd spinner is most
  likely the FIRST one, shown while the panel itself loads.
- Lead, not yet confirmed: the panel is a `StandalonePanelCommand`
  (`src/features/eds/commands/showSiteAccess.ts:18`), while Configure and Integrations are
  `BundledPanelCommand`s, which also give their loading screen a header
  (`getLoadingHeader`, `src/features/dashboard/commands/configure.ts:130`). Compare the two
  bases' loading HTML before changing anything.

## Done when

The Site Access screen's first loading view looks like the one Configure and Integrations
show, checked side by side in the Extension Dev Host.

## Shipped so far
- 2026-10-15  fix(ui): Site Access loads behind the house full-window spinner (`bac79ab35`)
