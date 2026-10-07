---
id: AI-13
kind: fix
area: ai
needs: []
value: med
status: built
---

# The AI tools install and run on whatever Node is first on the PATH

Filed 2026-10-07 from the owner's import test: "I also still see an EBADENGINE issue when
triggering an AI tools update."

## What the logs show (justrite-copy import, 2026-10-07 13:26)

`aiDefaultsInstaller.ts` runs `npm install` in `<project>/.demo-builder-mcp/` with no
`useNodeVersion`, so on the owner's machine it ran on Node 18.20.8:

- `@adobe-commerce/commerce-extensibility-tools@3.6.0` requires Node >=22.0.0
- `playwright@1.64.0-alpha` and `playwright-core` (from `@playwright/mcp`) require Node >=20
- `@dropins/mcp@1.1.3` is deprecated: "Renamed to @dropins/ai-tools"

## Why it is more than a warning

The servers also RUN on that Node. `.mcp.json` names the binary `resolveNodePath()` finds
(`which node`, then realpath, in `mcpConfigWriter.ts`), so commerce-extensibility-tools runs
on Node 18, which it does not support. The integration path does not have this problem: the
ERP install the same minute ran "npm install with Node 24" through fnm (`ensureFnmNodeVersion`).

## What to do

1. Pick the Node the AI tools need (the highest engine floor among ai-defaults packages,
   today 22) and use the managed one, as integrations do, for BOTH the install and the
   `.mcp.json` command. Decide what happens when fnm cannot provide it. Reuse [[AB-3]]'s
   mechanism rather than a second one: a catalog entry's `nodeVersion`, ensured through
   `ensureFnmNodeVersion` and passed as `useNodeVersion`. [[AB-22]]'s "read the Node version
   from `engines` / `.nvmrc`" could later derive the version for both.
2. Move `@dropins/mcp` to `@dropins/ai-tools` (check the new package's bin path and tools).
3. Both change the generated AI bundle, so follow `ai-context-authoring`: all four seams and
   an `AI_CONTEXT_VERSION` bump, so existing projects pick it up.

## Shipped so far

- 2026-10-07  2026-10-07 Proven live on justrite-copy: Regenerate AI Files installed on Node 24 via fnm with 0 npm warnings (7 EBADENGINE lines before); .mcp.json launches all three servers as fnm exec --using=24 node; each started from a bare environment and listed its tools (commerce-extensibility 11, Playwright 25, dropins-ai-tools 20). @dropins/mcp replaced by @dropins/ai-tools.
- 2026-10-07  fix(ai): the AI tools install and run on the Node they need, through fnm (`3737f9b41`)
- 2026-10-07  docs(backlog): AI-13 reuses the per-integration Node mechanism from AB-3 (`1ec2e103b`)
- 2026-10-07  docs(backlog): AI-13, the AI tools install and run on the PATH's Node (`47fdf9f71`)
- 2026-10-07  fix(ai): the AI tools update runs on the same Node as their install (`8c4f266bf`)
- 2026-10-07  docs(ai): the dropins server lists 20 tools; AI-13 built and proven live (`5ec5d633b`)
