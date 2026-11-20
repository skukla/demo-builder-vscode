---
id: PL-99
kind: chore
area: platform
needs: []
value: low
status: backlog
---

# Finished items still naming work

Filed 2026-11-16 by the beta.153 codebase sweep (`rptc-hygiene-scan`).

54 items marked shipped or built still name remaining work in their body ("Remaining: …",
"NEXT step 3: …") with no child item to hold it. Examples: AB-26e, AB-26h, AB-16c, AB-41, AB-46,
AB-47, AB-49, EDS-20, EDS-24, AI-11. For each, either file the remainder as a child item or reword it
as history if it is done. Run `node "$(git config dev-pipeline.root)/lib/backlog.mjs" leftovers` for the full
list.

Overlaps the post-cut backlog reconcile the owner asked for (close what beta.153 contains); do this
in the same pass.
