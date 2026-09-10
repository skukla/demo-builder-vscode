# ADR-019: Claude Code delivery is terminal-only, and the MCP server runs in-extension

**Status**: Accepted (2026-08-30). Supersedes the amendment chain of
[ADR-004](004-claude-code-harness.md); ADR-004's original decision — that Claude Code
(CLI) is the harness — still stands and is not superseded.

**Date**: 2026-08-30

---

## Context

[ADR-004](004-claude-code-harness.md) decided in May 2026 that Claude Code (CLI) is the
AI harness. That decision holds. What followed did not hold still: **six amendments were
applied to ADR-004 in place**, each partially superseding the last —

| Amendment | What it changed |
|---|---|
| 2026-05-24 | Workspace anchoring for the URI handler |
| 2026-05-24b | Binary surface; `auto` mode proved confusing |
| 2026-05-25 | Terminal as baseline; unified dock-to-right |
| 2026-05-26 | Prompt delivery via launch argument on spawn |
| 2026-05-27 | **Extension surface retired — terminal only** |
| (undated) | In-extension MCP server replaces the standalone process |

Amendment 5 retires the extension surface that amendments 2 and 3 had established. So a
reader wanting today's answer must read the original decision and then apply six
amendments in order, resolving the contradictions between them. In practice nobody does,
which leaves a 502-line document that looks authoritative while its current position is
unknown to its readers.

That structure is also against practice. Nygard's original (2011), AWS Prescriptive
Guidance and Microsoft's Well-Architected guidance all say an accepted record is
append-only and a changed decision is recorded in a NEW record that supersedes it. The
research is in
[`.rptc/research/adr-purpose-and-practice/research.md`](../../../.rptc/research/adr-purpose-and-practice/research.md).

**Why one record and not six.** The faithful reconstruction would be six ADRs dated May
2026, each superseding its predecessor. Writing them today would fabricate records that
never existed on those dates. This ADR instead states the settled position once, dated
honestly, and leaves the sequence in ADR-004 as the history it is.

## Decision

**Claude Code is launched only in a VS Code integrated terminal, and the MCP server runs
inside the extension.** Verified against the code on 2026-08-30.

**1. Terminal is the only surface.** `OpenInClaudeCommand`
(`src/commands/openInClaude.ts`) launches the CLI in an integrated terminal placed as a
tab in the active editor group. There is no harness setting; the retired
`demoBuilder.ai.harness` option is gone from `package.json`.

**2. Prompt delivery differs by path, deliberately.**

- **Spawn**: `claude --continue -- '<prompt>'`. The prompt is a launch argument, so it is
  race-free — Claude receives it at startup and auto-submits.
- **Reuse**: when a live "Claude Code" terminal exists, it is focused and the prompt is
  injected by bracketed paste (CSI 200~ / 201~), which pre-fills the input for the user
  to send.
- The clipboard is always written as a silent fallback.

**3. The MCP server runs in-extension.** `src/features/ai/server/inExtensionMcpServer.ts`
listens on a per-workspace Unix socket, reached through the `dist/mcp-proxy.js`
stdio↔socket forwarder that Claude Code spawns. The `vscode`-free file-based subset stays
in `src/mcp-server.ts` as a shared module; its standalone process is retired.

## Consequences

**Positive.** One delivery path means one thing to test and one thing to explain. The
in-extension server can reuse live extension services, so an agent tool does the same
work as the button beside it rather than a reimplementation.

**Negative.** Terminal-only means no integration with the Claude Code VS Code extension's
chat, and reuse cannot auto-submit — the user presses enter. Both are accepted costs, for
the reason in the next section.

**Neutral.** The socket is per-workspace and last-writer-wins, so "which build is
answering" is a real question when several windows are open; `mcp-live-probe` reads
`serverInfo` to answer it.

## Alternatives rejected

**The Claude Code VS Code extension surface (URI handler).** Tried, shipped, and retired
on 2026-05-27. Its URI handler opens a NEW chat on every launch and there is no public
API to inject a prompt into the live conversation — so the "pick a prompt, drop it into
the conversation you are already having" model cannot work there. This is the load-bearing
rejection: it is not a preference, it is a missing capability, and it will look like an
oversight to anyone who does not know.

**A timed or delayed paste after spawn.** Tried twice; it always raced the CLI's cold
start, because no "TUI ready" signal exists. The launch argument removed the race
entirely. Do not reintroduce a delay-based paste.

**A standalone MCP stdio process.** The original ADR-004 design. It could not reuse
extension services, so every tool reimplemented what a button already did, and it refused
to start without an open workspace folder — which the sidebar-driven window model never
provides, leaving anyone in that mode with no agent channel at all.

## Reference notes

- `demoBuilder.ai.harness` — the setting this decision removes. Named so the removal is
  legible; it intentionally resolves nowhere.
