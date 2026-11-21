---
id: PL-99
kind: chore
area: platform
needs: []
value: low
status: built
---

# Finished items still naming work

Filed 2026-11-16 by the beta.153 codebase sweep (`rptc-hygiene-scan`).

54 items were marked shipped or built and still named remaining work in their body ("Remaining: …",
"NEXT step 3: …") with no child item to hold it. Examples were AB-26e, AB-26h, AB-16c, AB-41, AB-46,
AB-47, AB-49, EDS-20, EDS-24, AI-11. The fix for each was to file the remainder as a child item, or
reword it as history if it was done. The backlog tool's `leftovers` command lists them.

Overlaps the post-cut backlog reconcile the owner asked for (close what beta.153 contains); do this
in the same pass.

## Shipped so far

- 2026-11-21  Reconciled 2026-11-21: all 54 finished items read against the code. Their remainders were reworded as history where the work was done or dropped, pointed at an open item where one carries it, moved to PL-111 where only the owner can settle it, or filed as new child items (AB-88 to AB-92, PL-112 to PL-121, AI-80, AI-81). leftovers reads 0.
