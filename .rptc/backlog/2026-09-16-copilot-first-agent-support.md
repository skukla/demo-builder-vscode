---
id: AI-9
kind: feature
area: ai
needs: []
value: high
status: active
---

# Demo Builder works with GitHub Copilot, and with Claude Code while it lasts

The team's tooling policy (told to the owner 2026-09-15) makes GitHub Copilot the primary
coding agent and retires Claude Code and Codex; Claude remains available for chat. Everything
this extension does for an agent today assumes Claude Code: the terminal it launches, the
config files it writes, the hooks it installs, and the checks that say "AI Ready".

The research (`.rptc/research/copilot-first-development/research.md`) found the split is smaller than it looks. The MCP
server and its 110 tools are standard MCP and already agent-neutral, and Copilot reads
`AGENTS.md`, `CLAUDE.md` and `.claude/skills/` directly. What is Claude-only sits at the edges:
where config is written, how hooks are shaped, how a chat is launched, and which paths the
readiness checks read.

Two things break rather than degrade:

- **Hooks.** Copilot reads Claude-format hooks on some surfaces but runs them under a different
  contract (different tool names, different input fields, a failing pre-tool hook denies the
  call). The `aio` guard we generate would block EVERY tool call in VS Code if a user enables
  Claude hooks, because that surface ignores matchers.
- **Tool count.** VS Code allows 128 tools per request. Our 110 plus dropins (21), Playwright
  and commerce-extensibility (11) goes past it on a storefront project.

## Decided (2026-09-16, owner)

- **Build for both.** One neutral core, a thin per-engine adapter. The expensive parts (tools,
  consent, skills) are already shared.
- **Target GitHub's own agent.** VS Code's Claude session target runs Anthropic's SDK and can
  bill through Copilot, which would keep our `.claude/` files working — but the policy line does
  not mention it, so nothing may depend on it being permitted.

## Open with the Copilot admin (blocks nothing, decides two steps)

- Does the org restrict MCP servers to an allowlist, and can an extension-provided server be
  allowed? (Decides how the server reaches VS Code.)
- Is VS Code's Claude session target permitted under the retirement? (Decides whether the
  `.claude/` bundle is a live path or only a legacy one.)

## Plan

`.rptc/plans/copilot-first-agent-support/` — ten steps, hook safety first.

## Shipped so far

- 2026-09-16  feat(ai): one place names the agent (`90e62df19`)
- 2026-09-16  refactor(ai): the generated bundle stops naming one agent (`5e1c551be`)
- 2026-09-16  fix(ai): a guard hook decides for itself instead of trusting its matcher (`4a1c25119`)
- 2026-09-16  docs(rptc): Copilot-first research, and the plan to serve both agents (`1da98b00c`)
- 2026-09-16  feat(ai): global MCP registration serves every agent that keeps a config file (`0e174aaad`)
- 2026-09-16  chore(backlog): record the first three steps on AI-9 (`2650ce28d`)
