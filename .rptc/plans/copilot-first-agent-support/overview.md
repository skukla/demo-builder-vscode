# Copilot-first agent support, without losing Claude Code

Backlog item: [[AI-9]]. Research: `.rptc/research/copilot-first-development/` (read that first;
every fact below comes from it, and each claim there is labelled Doc / Source / Inferred /
UNVERIFIED).

## The ask (owner, 2026-09-15 and 2026-09-16)

Colleagues will be required to use GitHub Copilot; Claude Code is retired as a coding agent.
Build for both agents rather than swapping one for the other, because "the parts that differ are
small and at the edges".

## The shape, in one paragraph

One neutral core, one thin adapter. The MCP server, its 110 tools, the consent model, the auth
handoffs and the skills are already agent-neutral and do not move. An `engine` seam decides three
things: which config files are written and where, which hook format is installed, and how a chat
is launched. Everything else reads that seam rather than branching on its own.

## Decisions ledger

| # | Date | Decision |
|---|---|---|
| 1 | 2026-09-16 | **Both engines, one core.** `demoBuilder.ai.engine` becomes real (`claude-code`, `copilot-cli`, `copilot-vscode`, `auto`), and is the ONLY place the agent is named. A second `if (engine === …)` anywhere else is a design failure, not a shortcut. |
| 2 | 2026-09-16 | **Target GitHub's own agent.** VS Code's Claude session target (Anthropic's SDK, billable through Copilot) would keep the `.claude/` bundle working, but the policy line does not mention it. Nothing may depend on it. If it turns out to be allowed, it costs us nothing — it reads what we already write. |
| 3 | 2026-09-16 | **Skills stay where they are.** Copilot reads `.claude/skills/<name>/SKILL.md` directly on every surface that matters. No second copy under `.github/skills`; a copy would have to be kept in sync and would double the hash-and-skip seam. Revisit only if a surface we need stops reading them. |
| 4 | 2026-09-16 | **Hooks are written in both formats, and the SCRIPTS stop trusting the harness.** A hook script checks the tool name itself and exits 0 when it does not apply, so a surface that ignores matchers cannot turn a guard into a blanket block. |
| 5 | 2026-09-16 | **The cloud agent is out of scope.** Our tools live in a local VS Code window on a Unix socket; an agent in GitHub Actions cannot reach them. Projects are built on the SC's machine. Say so in the docs rather than pretending otherwise. |
| 6 | 2026-09-16 | **Claude Code stays supported while it works.** It is retired for colleagues, not yet gone from this machine, and it is the only agent whose behaviour we have measured. It is removed when it stops being used, in one commit, per the no-soft-deprecation rule. |
| 7 | 2026-09-16 | **`.mcp.json` stays the primary config.** Verified in VS Code 1.137's source: workspace `.mcp.json` is discovered unconditionally, in Claude's `mcpServers` format, subject to a per-server trust prompt. Copilot CLI and the Agent Host read it too. |

## Plan status

Written 2026-09-16. Nothing built. Step 01 is the only one that fixes something that can break a
user today; the rest are additive.

## Steps

| # | Step | Depends on | Gate |
|---|---|---|---|
| 01 | Hooks stop being able to block everything (`step-01-hook-safety.md`) | — | — |
| 02 | The generated bundle stops naming Claude (`step-02-neutral-bundle.md`) | — | — |
| 03 | The engine seam (`step-03-engine-seam.md`) | — | — |
| 04 | Config delivery per engine (`step-04-config-delivery.md`) | 03 | — |
| 05 | VS Code registers the server itself (`step-05-vscode-registration.md`) | 03 | admin: MCP allowlist |
| 06 | The tool budget (`step-06-tool-budget.md`) | — | owner: a Copilot seat to measure with |
| 07 | One consent prompt, not three (`step-07-consent.md`) | 03 | owner: live run |
| 08 | Launching a chat without Claude (`step-08-launch.md`) | 03 | owner: live run |
| 09 | Readiness and diagnostics read both (`step-09-readiness.md`) | 03, 04 | — |
| 10 | The record: ADRs, docs, skills (`step-10-docs.md`) | 01–09 | — |

## Owner-gated and admin-gated

- **A Copilot seat on this machine** gates steps 06, 07 and 08: the tool cap, the consent
  behaviour and the launch path can only be settled by running them.
- **Two questions for the Copilot admin** (neither blocks starting):
  1. Does the org restrict MCP servers to an allowlist, and can an extension-provided server be
     on it? Decides whether step 05 is worth building.
  2. Is VS Code's Claude session target permitted? Decides whether the `.claude/` half is a live
     path or a legacy one.
- **No cloud writes anywhere in this plan.**

## What would invalidate the design

- If org policy blocks extension-provided MCP servers (`ChatAgentExtensionTools`), step 05 is
  dead and `.mcp.json` plus the trust prompt is the only route.
- If Copilot stops reading `.claude/skills/`, decision 3 flips and every skill needs a second
  home.
- If the tool cap turns out to drop tools silently rather than group them, step 06 grows from a
  measurement into a redesign of the tool surface.
