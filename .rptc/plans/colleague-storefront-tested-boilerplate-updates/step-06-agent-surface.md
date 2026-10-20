# Step 06: the agent surface

- `apply_updates` (`src/features/ai/server/applyUpdatesTool.ts`): the summary names the
  new category beside `template` (:44, :160), and the description says a colleague's
  storefront can have both (:72).
- `get_storefront_report` (`storefrontTools.ts:287-316`, `storefrontReport.ts`): the
  report shows the Adobe base, the tested version, and whether an update waits; a
  storefront that does not qualify says why in one line.
- Count-pinned tests and `docs/systems/mcp-server.md` move with them (`mcp-tool-authoring`).

Done when an agent asked "what updates are waiting for JustRite?" names both kinds, and
the report says why JustRite has no boilerplate row.
