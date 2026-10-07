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
