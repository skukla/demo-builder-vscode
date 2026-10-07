# Step 7: The AI bundle and terminals move to Demo Builder's store

Three things in every project point at the user's shared Node today:

- the ai-defaults tool launch lines (AI-13: `fnm exec --using=24 node`, which reads the user's
  fnm);
- the demo-builder MCP proxy entry, launched with `resolveNodePath()`: `which node` + realpath on
  the extension host's PATH, else Electron's own binary (on the owner's machine, the shared Node
  20);
- the `.claude/settings.json` git-sync hook, which runs `node -e`.

All three use the store: `FNM_DIR=<store> fnm exec --using=<nodeFor(...)> node ...`, built by
step 4's one helper (the env goes in the launch entry's `env`, which `.mcp.json` supports). The
proxy and the hook run on `nodeFor('ai-tools')` (24). Bump `AI_CONTEXT_VERSION` so the activation
sweep rewrites every existing project (the `ai-context-authoring` skill: all four seams).

`startDemo` (step 4's helper) and any terminal Demo Builder opens use the store the same way.

**Tests:** the launch entries carry the store and the major; the proxy no longer uses
`which node`; the sweep stamp moves.
