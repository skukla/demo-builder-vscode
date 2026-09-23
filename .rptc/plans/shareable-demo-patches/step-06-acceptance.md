# Step 06 — Acceptance and docs

1. Add Jen's storefront by link: the card says boilerplate 4.0.1 vs 6.0.0 and "5 of Demo
   Builder's fixes fit"; the completion offers them; accepting writes one commit with five
   patches; the caveats for the two that miss remain; reset offers again and finds them
   already present.
2. Save one of our own Bodea projects as a demo package; start a project from it: the
   description carries `builtWith`; creation applies the two newer patches where they fit
   and re-pins only if the canonical files are unchanged; the completion says which.
3. Import the same demo as a zip: the dialog shows the version and the fit before the
   repository exists.
4. The dry check still runs, and only runs, for a storefront with no lineage.
5. Docs: `docs/systems/sharing-a-demo.md` gains "What Demo Builder writes, and what it
   never touches", "Fixes offered to a colleague's storefront", "Boilerplate versions";
   the caveat copy is pinned by tests; `mcp-tools.md` for the create/reset argument.
