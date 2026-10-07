# Step 06 — The tool budget

Gated on a Copilot seat: this step starts with a measurement, and the measurement decides the
design.

## The number

VS Code allows **128 tools per request**. We expose **110** (`docs/systems/mcp-tools.md`). A
storefront project also installs dropins (21 by its own description) and Playwright, and an App
Builder project adds commerce-extensibility (11). A storefront project is therefore over the cap
before Copilot's own built-in tools are counted.

Above a threshold VS Code groups tools into "virtual tools"
(`github.copilot.chat.virtualTools.threshold`). What that does to a tool the agent needs — group
it, hide it, drop it — is not documented well enough to design against.

## Measure first

On a storefront project in Copilot agent mode, with our server connected:

1. How many tools reach a request, and which of ours are missing.
2. Whether a tool inside a virtual group can still be called by name.
3. Whether Copilot's own tools count against the same budget.

Record the numbers in this step file, dated, the way the ERP spike recorded its four unknowns.

## Measured 2026-10-06 (VS Code 1.140, built-in Copilot, GPT-6.1 Sol, agent mode)

Source: the saved chat session (`workspaceStorage/<ws>/chatSessions/<id>.jsonl`) for "List my
projects" in the projects-root window, plus the built-in Copilot extension's own code
(`extensions/copilot/dist/extension.js`).

1. **All 158 of our tools reach the request, deferred.** The prompt carried an
   `availableDeferredTools` list of 187 names — 158 `mcp_demo-builder_*` and 29 of VS Code's own.
   The agent called `tool_search` ("demo-builder list_projects list all Demo Builder projects"),
   then `mcp_demo-builder_list_projects`; three steps, 13 s. Nothing was missing or dropped.
2. **Virtual tool groups were not used.** No `activate_*` tool appeared. Grouping
   (`github.copilot.chat.virtualTools.threshold`, default 128) is the fallback for a model WITHOUT
   tool search; it groups tools behind `activate_<group>` and still drops none.
3. **Copilot's own tools share the list** but its core tools are never deferred
   (`nonDeferred`), so they cost nothing against ours.

Which models search: `supportsToolSearch = capabilities.supports.tool_search ?? I8e(model)` —
GPT-5.4/5.5 and newer families, Claude 4.5 and newer. The hard error "Cannot have more than 128
tools per request" exists only on the `vscode.lm` extension-API path, and only for a model without
tool search; agent mode does not take it.

**Decision: build none of the three options below.** The cap does not bind; what matters with
deferred tools is that a semantic search finds the right one, i.e. the tool DESCRIPTIONS — the same
thing Claude Code's ToolSearch already depends on, and already what `mcp-tool-authoring` governs.
Revisit only if a live run shows a tool the search cannot find, or an SC on a model without tool
search reports degraded calling.

## Then choose (not taken — see the decision above)

- **Tool sets** — publish groups (storefront, Adobe Console, content, diagnostics, project) so a
  user enables what the task needs. Least code, most user action.
- **Consolidate** — several read tools answer neighbouring questions and could be one tool with a
  parameter. Real work, but it also shrinks the surface for Claude Code, where 110 tools is
  already a lot to choose from.
- **A default subset** — expose the busy tools and put the rest behind a setting. Cheap, but it
  hides capability and the agent-gap scans say unused tools are already a problem.

The measurement picks one. Do not build all three.

## Checks

- The tool count test (`inExtensionMcpServer.test.ts` pins names and counts) moves with whatever
  lands.
- `docs/systems/mcp-tools.md` regenerates.
- Live: the journey a storefront SC actually runs — create, deploy, publish — completes in Copilot
  agent mode without a missing tool.
