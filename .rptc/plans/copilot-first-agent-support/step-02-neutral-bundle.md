# Step 02 — The generated bundle stops naming Claude

The text we write into every project tells the agent to do Claude-only things. Copilot reads the
same files, so the instructions have to be true for both.

## What changes

| Where | Today | After |
|---|---|---|
| `agentsMdSections.ts` | "## Try asking Claude" | "## Try asking" (or the agent's own name, resolved from the engine seam) |
| same | `ToolSearch` guidance for deferred tool loading | removed; it is Claude Code's mechanism and does not exist in Copilot |
| same | `mcp__<server>__<tool>` examples | tool names without a harness-specific prefix |
| same | "via .claude/mcp.json" | the config path for the engine, or no path at all |
| `homeAiContextWriter.ts` | "skills in `.claude/skills/`" | keep the path (Copilot reads it), drop the Claude framing |
| `templates/skills/create-eds-project.md` | "from Claude" | neutral |
| `ai-defaults.schema.json` | "Command Claude Code runs" | "Command the agent runs" |

Skills themselves do not move (decision 3).

## Files and seams

`aiBundle/aiContextWriter.ts`, `agentsMdSections.ts`, `homeAiContextWriter.ts`, the skill
templates, `ai-defaults.schema.json`.

This is a generated-bundle change, so it obeys the four seams and the version discipline in
`.claude/skills/ai-context-authoring/`: `buildMcpConfig`, `installAiDefaultsMcpTools`,
`componentInstallationOrchestrator`, `handleRegenerateAiFiles`, and a bump of
`AI_CONTEXT_VERSION` (32 today) so the activation sweep refreshes existing projects.

## Checks

- `aiContextWriter.writeAgentsMd` tests gain a case: no "Claude", no `ToolSearch`, no `mcp__` in
  the rendered AGENTS.md.
- `tests/templates/ai-bundle-coherence.test.ts` still passes.
- A project created before the bump picks the new text up on the next activation (the sweep), and
  a hand-edited AGENTS.md is still skipped, not clobbered (ADR-013).

## Built (2026-09-16)

- `buildTryAskingClaude` → `buildTryAsking`; the heading is "## Try asking".
- The `ToolSearch` paragraph is gone. The section still tells the agent to search by SERVER name
  and now says plainly that the mechanism and the tool-name spelling differ between agents.
- `ai-defaults.schema.json`: "Command Claude Code runs" → "Command the agent runs".
- Module comments name Copilot alongside Claude Code where they describe what reads a file.
- `AI_CONTEXT_VERSION` 32 → 33, with the reason in the comment above it, so the activation sweep
  carries the neutral text to projects that already exist.
- Test: the rendered AGENTS.md matches no `\bClaude\b`, no `ToolSearch`, no `mcp__`, for both an
  EDS and a headless project. Control run: it fails against the old wording and passes against the
  new, so it is testing the text and not itself.
- Checked and NOT changed: no shipped skill template names Claude (the research inventory said one
  did; it does not today), and the home AGENTS.md body was already neutral.
