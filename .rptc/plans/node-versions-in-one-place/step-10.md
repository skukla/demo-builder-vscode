# Step 10: The AI bundle and terminals use the folder

Three things in every project still point at the SC's own Node:

- the ai-defaults tool launch lines (`fnm exec --using=24 node`, reading the SC's fnm);
- the demo-builder MCP proxy, launched with `resolveNodePath()` (`which node`, else Electron);
- the `.claude/settings.json` git-sync hook (`node -e`).

All three become `FNM_DIR=<folder> fnm exec --using=<register> node ...` (the env in the launch
entry's `env`, which `.mcp.json` supports), from step 4's helper. Bump `AI_CONTEXT_VERSION` so the
activation sweep rewrites every existing project (`ai-context-authoring` skill: all four seams).

**Tests:** the launch entries carry the folder and the Node; the proxy no longer uses
`which node`; the sweep stamp moves.

## Done 2026-10-07, and what moved to step 11

Built: the ai-defaults launch lines carry `env: { FNM_DIR: <Demo Builder's Node folder> }` and
run on `demoBuilderNode()`; the copied `AI_TOOLS_NODE_VERSION` constant is gone; v40 bump.

**Not moved here, on purpose:** the Demo Builder connection (the MCP proxy entry) and the
git-sync hook still launch with the SC's PATH Node (`resolveNodePath`: `which node` + realpath,
else VS Code's own binary). Any Node runs them, so nothing is broken today. But
`resolveNodePath` has five callers, one of them the entry written into the SC's own
`~/.claude.json` (`globalMcpRegistration.ts`), so moving it is its own careful change. It MUST
happen before step 11's one-time cleanup ships: that cleanup removes Node versions from the
SC's own fnm, which can include the exact Node the connection's path points to. Step 11 starts
with it.

