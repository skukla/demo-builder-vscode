# Step 03 — The engine seam

One module answers "which agent are we serving?", and every later step reads it. Without this,
"support both" becomes a scatter of `if` statements, which is how the Claude assumptions spread in
the first place.

## Behaviour

- `demoBuilder.ai.engine` gains real values: `auto` (default), `claude-code`, `copilot-cli`,
  `copilot-vscode`. Today the enum holds one value and nothing reads it
  (`package.json`, `openInClaude.ts`).
- `auto` resolves once per session, in this order: an explicit setting wins; otherwise Copilot
  when the `claude` CLI is absent and Copilot is present; otherwise Claude Code; otherwise
  Copilot. The resolved value is logged at startup, because a wrong guess must be visible.
- The module exposes what the rest of the code needs, and nothing else:
  - the display name ("Claude Code", "Copilot"),
  - where global MCP config lives for that engine,
  - which hook format to write,
  - how to launch a chat,
  - which paths the readiness checks read.
- `get_setting`/`set_setting` already expose the setting to agents; the resolved engine joins
  `get_ai_status` or the diagnostics payload so an agent can see which one is in play.

## Files

New `src/features/ai/engine/` (resolver + the per-engine descriptors), `package.json` enum,
`src/commands/openInClaude.ts` (the `Engine` type moves out of it).

## Checks

- Unit: each resolution path, with the CLI present and absent; an explicit setting always wins.
- The architecture suite: no module outside `src/features/ai/engine/` names an engine string.
  That rule is the point of the step, so it is enforced, not just intended
  (`tests/sop/architecture-rules.test.ts` is where it belongs).

## Not in this step

No behaviour changes for anyone yet: `claude-code` keeps doing exactly what it does today. Steps
04–09 hang their differences off this seam.

## Built (2026-09-16)

- `src/features/ai/engine/agentEngine.ts`: `AgentEngine`, `describeEngine` (display name, global
  MCP config path, hook format, launch kind) and `resolveEngine`.
- `demoBuilder.ai.engine` now offers `auto` (default), `claude-code`, `copilot-cli`,
  `copilot-vscode`, each with a label and a description.
- `openInClaude`'s `Engine` type is an alias of the seam's type. Nothing else changed: the launch
  path still does exactly what it did.
- Tests: an explicit setting always wins, even for an absent CLI; `auto` prefers Copilot when both
  are installed, falls back to what is there, and answers `copilot-vscode` when neither is — the
  one engine that needs nothing on the PATH. The descriptors are pinned field by field.

## Deferred

The architecture rule ("nothing outside `features/ai/engine/` names an engine") is not enforced
yet: the launch path still spawns `claude` by name, and the config writers still write Claude's
paths. The rule lands with step 08, when the last of those moves behind the seam. Enforcing it
now would mean an exemption ledger entry per caller, which is the opposite of the point.
