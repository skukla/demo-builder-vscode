# Step 04 — Config delivery per engine

Depends on step 03.

## What is already right

`.mcp.json` is the primary config and stays. Verified in VS Code 1.137's source: a workspace
`.mcp.json` is discovered unconditionally, in Claude's `mcpServers` format, with a per-server
trust prompt. Copilot CLI and the Agent Host read it too. Nothing to change for the project file
itself.

## What changes

1. **Global registration follows the engine.** Today `globalMcpRegistration.ts` upserts our server
   into `~/.claude.json` on every activation. For Copilot CLI the equivalent is
   `~/.copilot/mcp-config.json`. The resolver says which to write; both are written when both CLIs
   are present, because a machine can have both.
2. **`.claude/mcp.json` is reconsidered.** No Copilot surface reads it, and Claude Code reads
   `.mcp.json`. Either it earns its place or it goes in the same commit (no soft deprecation).
   Check what still reads it — `mcpDriftDetector`, `aiSetupVerifier`, `mcpInspector` do.
3. **`.vscode/mcp.json` is written only if the trust prompt proves a problem.** It is the
   documented VS Code path, but 1.137 reads `.mcp.json` already, and a third copy is a third thing
   to keep in step. Decide from the live run in step 05, not from the docs.
4. **`.gitignore` treatment follows whatever is written**, as it does now for the three existing
   paths.

## Files

`aiBundle/globalMcpRegistration.ts`, `aiBundle/mcpConfigWriter.ts`, the engine descriptors from
step 03, and the readers listed above.

## Checks

- Unit: with engine `copilot-cli`, the Copilot config file is written and its `mcpServers` entry
  matches the one we write for Claude; with `claude-code`, today's behaviour is unchanged.
- Idempotent: a second activation does not duplicate entries in either file (the existing
  upsert tests cover the Claude half).
- Live: `copilot` in a generated project lists the demo-builder tools.

## Built (2026-09-16)

- registerGlobalMcp(dist, node?, engines?) writes the demo-builder entry to every named engine's
  user config — ~/.claude.json and ~/.copilot/mcp-config.json, both under mcpServers — creating
  ~/.copilot/ when absent, and returns the paths written.
- The read-merge-write is one helper, so the "preserve everything else, refuse a malformed file"
  guarantee covers both files.
- refreshGlobalMcpIfPresent checks every agent's config after an extension update.
- The command's confirmation names the files rather than promising Claude Code.
- Tests: both files written with the same entry, the directory created, a Copilot user's other
  servers preserved, a malformed Copilot config refused untouched, an engine with no user config
  writing nothing, and a stale Copilot entry repaired.

## Still open in this step

- The duplicate project config under .claude/ — no Copilot surface reads it, and its only readers
  are our own inspectors. Decide keep-or-delete when step 09 moves those readers; deleting it is a
  bundle change, so it rides an AI_CONTEXT_VERSION bump.
- A .vscode/mcp.json is deliberately NOT written. VS Code 1.137 already discovers the workspace
  .mcp.json (verified in its source), so a third copy would be a third thing to keep in step.
  Revisit only if the live run in step 05 shows the trust prompt is a problem.
