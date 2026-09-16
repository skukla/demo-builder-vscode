# Step 09 — Readiness and diagnostics tell the truth for both

Depends on steps 03 and 04.

## The problem

Everything that answers "is this project ready for the agent?" reads Claude's paths:
`aiSetupVerifier`, `mcpDriftDetector`, `mcpInspector`, `skillInspector`, `mcpHealthCheck` and the
capabilities modal read `.claude/mcp.json`, `.claude/skills/` or `~/.claude.json`. A colleague on
Copilot, whose setup is fine, would be told it is not.

## Behaviour

- The checks read the paths the resolved engine names, and report which engine they checked.
- "AI Ready" means: the server is reachable by the engine in use, the skills are present, and the
  bundle is current. It stops meaning "Claude Code is configured".
- Claude-only surfaces are gated rather than left to rot:
  - claude.ai connector detection (`sessionMcpDetector.ts`) stays — Claude chat remains available
    under the policy, so this is still a real signal, but it is labelled as being about the chat
    app, not the coding agent.
  - the `~/.claude` disk footprint in Diagnostics shows only when Claude Code is present.
  - the `claudeCode.preferredLocation` reset goes when the Claude launch path does.
- The Diagnostics report names the engine, the config files actually written, and where the
  server socket is — the three things a "why can't the agent see my project?" ticket needs.

## Checks

- Unit: a project with Copilot config and no `.claude/` reads as ready under `copilot-*`, and as
  not ready under `claude-code`, with the reason naming the missing file.
- The drift detector still catches a stale entry in whichever file it checked.
- Live: the AI Ready badge on a Copilot-only machine.
