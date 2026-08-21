# Partial HandlerContexts are cast to full and handed to handlers

**Filed:** 2026-08-21
**Origin:** The boundary-cast audit's first triage. Seven sites build a
PARTIAL `HandlerContext` and cast it to the full interface before handing it
to handlers that may reach for any field.

## The claim

`HandlerContext` declares ~15 managers/loggers/callbacks. Handlers written
for the panel surfaces assume the shared factory
(`createPanelHandlerContext`) filled every field — that factory exists
precisely because per-panel guessing produced "undefined cast" failures. But
seven NON-panel entry points (commands, headless services, MCP plumbing)
build a few-field object and cast it up. A handler reached through one of
these that touches an unfilled field fails at runtime with
`Cannot read properties of undefined`, and no type ever warned.

## The sites (each needs its OWN trace — which handlers, which fields)

| Site | What it builds | Reaches |
|---|---|---|
| `src/features/ai/server/headlessHandlerContext.ts:45-47` | documented contract: `errorLogger`/`progressUnifier`/`stepLogger` deliberately `undefined as unknown as` — headless-safe handlers must not touch them (`mcp-tool-authoring` governs) | every MCP tool handler |
| `src/features/eds/commands/manageGitHubRepos.ts:40` | minimal context → `getGitHubServices` | GitHub token/repo services |
| `src/features/eds/services/refreshBlockLibraryHeadless.ts:83` | `{ context, logger }` only | the refresh pipeline's helpers |
| `src/features/prerequisites/services/PrerequisitesManager.ts:188` | `createMinimalContext()` | whatever the install flow dispatches |
| `src/commands/migrateStorefrontNames.ts:79` | hand-built literal | migration helpers |
| `src/commands/showPromptsPicker.ts:106` | hand-built literal | `aiHandlers` prompt handlers |
| `src/features/ai/server/applyUpdatesTool.ts:99` | `ctx.stateManager as unknown as StateManager` (a field-level variant) | update pipeline |

## The investigation, per site

1. List the handlers/services actually reachable from the cast context.
2. Grep each for `context.<field>` access; diff against what the site fills.
3. Verdict per site: (a) provably safe → narrow the PARAMETER type of what it
   calls to the fields it uses (the honest fix — then the cast dies and the
   compiler enforces the contract forever), (b) gap found → fix like a bug
   (regression test first), (c) deliberately partial by contract
   (headlessHandlerContext) → keep, but the contract stays documented at the
   declaration.

The `headlessHandlerContext` row is the worked example of (c) — and also the
cautionary tale: its safety rests on a PROSE rule ("headless-safe handlers
don't touch these"), which is a claim, not a check. If the trace in (1)/(2)
is cheap to script, running it over the MCP handler set would turn that prose
into evidence.

## Why not just "fix" them now

Each verdict requires the reachability trace; asserting safety from the
site's shape alone is exactly the over-reading the verification rules
prohibit. Seven small investigations, each a self-contained slice.
