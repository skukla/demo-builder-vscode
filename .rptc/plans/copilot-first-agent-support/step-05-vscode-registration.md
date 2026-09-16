# Step 05 — VS Code registers the server itself

Depends on step 03. Gated on one question for the Copilot admin.

## Why

Two reasons, neither of which `.mcp.json` gives us:

1. **Any folder, no prompt.** A file-based server is discovered per workspace folder and needs a
   trust approval. A registered provider is there because the extension is there — which is the
   experience an SC expects from a tool they installed.
2. **A name an admin can allow.** If the org runs an MCP allowlist, the server needs an identity.
   A registered definition has a stable label; a spawned command has a per-user path
   (`/Users/<name>/.vscode/extensions/...`). Whether allowlists match the label or the command is
   **UNVERIFIED** — this is the question to ask before building this step.

## Behaviour

- The extension contributes an MCP server definition provider
  (`vscode.lm.registerMcpServerDefinitionProvider` + `contributes.mcpServerDefinitionProviders`),
  serving the same stdio command the file config names, with the project path passed through
  `env`/`cwd` instead of relying on the proxy's `#cwd:` preamble.
- `engines.vscode` rises from `^1.84.0` to at least `^1.101.0`. The API is in the stable
  `vscode.d.ts` (verified at 1.137.0, line 20841); local VS Code is 1.137.
- The file config stays for Copilot CLI, the Agent Host and Claude Code.

## Risk to check before building

The org can disable extension-provided tools entirely (`ChatAgentExtensionTools`). If that policy
is on, this step buys nothing and `.mcp.json` is the only route. One question to the admin
answers both this and the allowlist.

## Checks

- Unit: the provider yields a definition whose command and env match the file writer's, so the two
  routes cannot drift.
- Live: in a clean VS Code profile with no `.mcp.json`, Copilot agent mode lists demo-builder
  tools; a tool that needs the project resolves the right one with two windows open.
- The raised `engines.vscode` does not break activation on the minimum supported version.
