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

## Then choose

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
