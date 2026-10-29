# Step 10 — The record

Depends on 01–09. The decisions in this plan contradict two ratified ADRs, and a plan does not
overrule an ADR.

## What changes

- **ADR-004 (`004-claude-code-harness.md`)** says Claude Code is the AI harness and that VS Code
  Chat was deliberately out of scope. Both halves are now false. Amend it with a dated section, or
  supersede it with an ADR that states the engine seam and why the decision moved. The
  reason matters more than the choice: a tooling policy changed, not our judgement of the
  technology.
- **ADR-019 (`019-claude-code-delivery-terminal-only.md`)** records terminal-only delivery. If
  step 08 finds a way to open Copilot Chat with a prompt, that ADR is superseded; if it does not,
  it is confirmed for a second agent, which is worth writing down.
- **`docs/systems/mcp-server.md`** names Claude Code as the client throughout, including the
  config section. Rewrite around the engine seam; keep the socket and proxy description, which is
  unchanged.
- **`docs/systems/mcp-tools.md`** regenerates if step 06 moves the surface.
- **A new feature page** for working with the extension under Copilot: which agent surfaces work,
  what the cloud agent cannot do and why, how to check readiness, what an admin may have blocked.
- **Skills:** `ai-context-authoring` gains the engine seam and the both-formats hook rule;
  `mcp-tool-authoring` gains the tool budget and the `readOnlyHint`-drives-confirmation note;
  `webview-test-authoring` is untouched.
- **CHANGELOG** entries as each step lands, in the SC's words: "Demo Builder works with Copilot"
  rather than "engine abstraction introduced".

## Checks

- The convention index regenerates (`npm run docs:conventions`), and `handbook-links` passes.
- `cited-identifiers` passes: every file and symbol named in the new docs exists.
- The ADR README table lists the amended or superseded entries.
