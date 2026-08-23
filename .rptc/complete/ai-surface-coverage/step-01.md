# Step 01 — Inventory every handler against the tool surface

**Kind:** analysis producing a committed artefact + an enforcing test
**Touches:** `tests/features/ai/server/`, `docs/systems/mcp-server.md`
**No product behaviour changes.**

## Why this is a step and not an assumption

Two regex probes over the handler maps disagreed: `dataInstallerHandlers` counted 6 then 0,
`aiHandlers` 5 then 7. The maps use two key shapes — quoted (`'check-mesh': …`) and bare
(`requestStatus: handle…`) — and each probe saw one. Any gap number eyeballed from a grep is
unreliable, so the inventory has to be derived by something that reads both shapes and is
itself checked.

## Goal

For every handler in every feature map, know three things:

1. Is it exposed as an MCP tool today?
2. Is it headless-safe (per `mcp-tool-authoring`: no panel dependence for the result, no
   modals, no `vscode.window` prompts on the happy path)?
3. If it is headless-safe and unexposed — is that deliberate?

(3) is step 02's judgment. This step establishes (1) and (2) and makes them un-driftable.

## RED — the test comes first

Write `tests/features/ai/server/toolCoverage.test.ts`. It must fail before the exclusion
list exists.

Assertions:

- **Every handler map key resolves to a known disposition.** Build the set of handler names
  from the maps themselves (import them — do not parse source; that is what broke the
  probe). Every key is either exposed by a descriptor row, or present in a documented
  exclusion list with a non-empty reason. Anything else fails, naming the handler.
- **Exposure is judged against ALL 58 tools, not the 26 descriptor rows.** Only 26 tools
  come from the descriptor tables; the other 32 are registered by domain modules
  (`authTools`, `adobeTools`, `cloudResourceTools`, `storefrontTools`, `createProjectTool`,
  `currentProjectTool`, `deleteProjectTool`, `edsResetTool`, `applyUpdatesTool`,
  `discoveryTools`, `viewTools`) and by the file-based `registerProjectTools`. A handler
  with no descriptor row is frequently still reachable — `syncStorefront` has no row, yet
  `sync_storefront` does the work. Counting descriptor rows alone overstates the gap by
  roughly a third. Reference: research Finding 1(c).
- **The exclusion list has no stale entries** — every name in it still exists as a handler.
  A removed handler leaving its excuse behind is how the list rots.
- **Positive control:** a known-exposed handler (`check-mesh`) is reported exposed, and a
  known-excluded one is reported excluded. Without this the test can pass by classifying
  everything into one bucket.

The exclusion list lives beside the descriptors as data, e.g.
`src/features/ai/server/toolCoverage.ts`, exporting
`NOT_EXPOSED: Record<handlerName, reason>`.

## GREEN

1. Import the five maps (`dashboardHandlers`, `aiHandlers`, `meshHandlers`, `edsHandlers`,
   `dataInstallerHandlers`) and derive names with `Object.keys` — shape-agnostic by
   construction.
2. Derive exposed names from `[...READ_DESCRIPTORS, ...ACTION_DESCRIPTORS]` via each row's
   `type` field.
3. Create `toolCoverage.ts` with every currently-unexposed handler mapped to the placeholder
   reason `'unreviewed — see plan step 02'`.
4. Test goes green with the inventory complete and honest about what has not been judged yet.

## Then record it

Add a "Coverage" subsection to `docs/systems/mcp-server.md` with the derived table: per map,
handlers / exposed / excluded. Note that the numbers come from the test, so the doc and the
gate cannot disagree.

## Done when

- `toolCoverage.test.ts` passes, including both positive controls.
- Every handler has a disposition; unreviewed ones say so explicitly.
- `docs/systems/mcp-server.md` carries the table.
- `gate` green.

## Notes

- The two counts both probes agreed on — `edsHandlers` 15 handlers, 2 exposed — are the
  expected headline. If the derived number differs, trust the derivation and say so.
- Do NOT classify anything as headless-safe from its name. Step 02 reads the bodies.
- `dataInstallerHandlers` is in the inventory (it is data) but out of scope for exposure.
