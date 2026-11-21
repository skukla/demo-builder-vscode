---
id: PL-118
kind: feature
area: platform
parent: PL-56d
needs: []
value: med
status: backlog
---

# Moving projects to a new machine asks for each backend's login once

Filed 2026-11-21 from the backlog reconciliation. PL-56d said: file this when the item ships. It
shipped in v1.0.0-beta.153 and nothing was filed.

Import never carries a credential (D24). So an SC moving five projects on one Commerce backend types
the same login five times. Import could notice a login already saved for the same backend address
and offer to reuse it.

Done when importing a second project on a backend whose login is already saved offers that login,
and the SC can decline.
