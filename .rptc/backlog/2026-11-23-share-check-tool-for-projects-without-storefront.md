---
id: AI-82
kind: feature
area: ai
needs: []
value: med
status: backlog
---

# An agent can check whether a project without a storefront can be shared

Filed 2026-11-23, from AI-79's triage of the coverage scan (owner chose to build it the same day).

The screen asks `getShareDatapackCheck` before sharing a project that has no Edge Delivery
storefront: can colleagues get its datapack, and can they reach each custom integration's
repository? No tool answers that for an agent. `get_demo_package_preview` refuses projects without
a storefront, and `export_demo_bundle`'s `packNote` covers only a private library pack, not a pack
colleagues cannot get or a custom integration in a private repository
(`.claude/skills/ai-coverage-scan/triage.json`, `getShareDatapackCheck`).

Done when an agent can get the same verdict the screen shows for such a project, through the same
handler (one path, not a second check), and the triage entry is removed because the gap is closed.
