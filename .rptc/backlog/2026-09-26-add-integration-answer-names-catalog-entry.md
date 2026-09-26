---
id: AB-34
kind: fix
area: app-builder
needs: []
value: low
status: built
---

# add_integration's answer names the catalog entry, not the name the SC gave

Filed 2026-09-26. Adding the ERP pair as "Northwind ERP" worked (the workspace, the Admin menu
and the tile all say Northwind ERP), but the tool's answer called it "ERP Integration", the
catalog entry's name. An agent relaying that answer tells the SC the wrong name. The answer
should carry the display name the add stored. Check the button path's toast for the same.

## Shipped so far

- 2026-09-26  2e037d232: the answer carries the progress title's name (Northwind ERP Integration). Tested; not yet seen live (needs an add).
