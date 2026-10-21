# Step 04: Fix with AI opens the chosen engine

## What

After the clash is kept (step 02), the builder runs `demoBuilder.openInClaude` with
`{ prompt, fresh: true, attachFiles }`. The command decides the engine; this code never
names one (`agentEngine.ts` rule).

- `OpenInClaudeArg` gains `attachFiles?: string[]` (absolute paths). Copilot passes them
  as `attachFiles` to `workbench.action.chat.open`; Claude Code ignores them, because the
  prompt names the paths.
- The prompt, built in one function and tested as text:
  - which storefront and which update (the colleague's changes, or Adobe's tested version)
  - each clashing file's path
  - what each side changed, as two short diffs from the base: the update's, and the
    storefront's (the colleague's or the SC's)
  - the rule: keep what both sides meant, remove every conflict marker, change only these
    files, do not commit, push or run Demo Builder tools that write
  - the finish: "when you are done, tell the SC to open Check for Updates and apply
    'Finish …'"

## Where

- `src/commands/openInClaude.ts` (`normalizeArg`, `openVsCodeChat`).
- A `buildClashPrompt(clash, diffs)` in `src/features/updates/services/`.

## Tests

- Copilot: `workbench.action.chat.open` receives `mode:'agent'`, the query and the files.
- Claude Code: the terminal line carries the prompt; no attach flag.
- The prompt names every file and both diffs, and never an engine.

## Done when

On JustRite, Fix with AI opens the SC's engine with the header clash in front of it.
