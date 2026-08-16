---
name: mcp-tool-authoring
description: Add a tool to the in-extension MCP server via handler + descriptor row — headless-safety rules, read vs action descriptors, zod input schemas, guard placement, the count-pinned tests, and the doc sync. Use when exposing new functionality to AI agents (a new MCP tool), promoting an existing webview handler to the tool surface, or when a descriptor/handler-count test fails after adding one.
---

# MCP Tool Authoring

The in-extension server's descriptor pattern turns an existing handler into an MCP tool
with ~10 lines. The traps are in what qualifies and what else must move.

## The pattern

1. **Handler** in an existing map (`dashboardHandlers`, `aiHandlers`, `meshHandlers`) —
   an ordinary `MessageHandler` returning `{ success, data?, error?, code? }`.
2. **Descriptor row**:
   - Reads → `READ_DESCRIPTORS` (`src/features/ai/server/readDescriptors.ts`)
   - Actions → `ACTION_DESCRIPTORS` (`actionDescriptors.ts`): add `confirm: true` for
     destructive ops; `inputSchema` is a zod shape (validation happens at the tool-call
     layer, so the model retries on mismatch — but the HANDLER must still validate,
     it's also reachable from webviews).
3. Registered from `extension.ts` (descriptor modules import handler maps, so they stay
   out of the vscode-free server module).

## Headless-safety (the qualifying bar)

A descriptor-exposed handler runs with NO panel: no `sendMessage` dependence for its
result, no modals, no `vscode.window` prompts on the happy path
(`headlessHandlerContext.ts` provides the context). `vscode.window.showWarningMessage`
as a side channel is tolerated; a handler that NEEDS interaction doesn't qualify.

## Guards and side effects

- Adobe-touching tools reuse the existing chains — `runGuards`
  (`appBuilderComponentHandlers.ts`: auth → org-mismatch → developer role) or the
  equivalent for their domain. Never inline org checks (see `adobe-org-context`).
- **No writes hiding in reads**: a read tool must not call anything that creates on
  miss (e.g. `ensureOAuthCredentialId` creates a credential — `list_console_apis`
  derives its `managed` flags from the persisted union instead of probing the live
  credential for exactly this reason).
- Persist state only AFTER the side effect succeeds (`add_console_apis` pattern).

## Not every tool is a descriptor row

Tools that need services rather than a handler map are registered **directly** on the
server, in `src/features/ai/server/*Tools.ts` (`cloudResourceTools`, `storefrontTools`,
`contentAuthoringTools`, …), wired from `extension.ts`. File-based tools that must stay
`vscode`-free live in `src/mcp-server.ts` behind `registerProjectTools`.

Pick by what the tool needs: a handler map → descriptor row; an EDS/Adobe service →
a `*Tools.ts` module; the project directory only → `mcp-server.ts`.

## Fixtures for anything across a network boundary must come from a LIVE response

**The most expensive mistake available here, and it goes green.** Twice in one session
(2026-08-16) a fixture was composed from what the WRITING side produces, code was written to
match it, and every check passed:

- `plugins.da.unsafeHTML` is what `promote_block_to_library` writes — and is present on **4 of
  78** real components. The other 74 use `rows`/`columns` or `name`/`type`/`fields`. A tool
  built on the fixture would have failed on 95% of blocks.
- DA.live listings prefix entry paths with **`/{org}/{site}`**, not `/{site}`. The fixture used
  one segment, so `list_content` returned paths no sibling tool accepted.

Neither `tsc` nor `typecheck:tests` can catch this: an invented shape is still valid JSON and
still typechecks. Capture the real thing with `mcp-live-probe`, then say in the test file where
it came from so nobody "simplifies" it back.

Same class as `webview-test-authoring`'s mocked-vs-bundled-JSON trap.

## Verify against the running server before calling it done

Green tests mean the tool matches its fixtures. Use `mcp-live-probe` to check it matches
reality — and to read `serverInfo`, which names the build that is actually answering
(the socket is shared and last-writer-wins, so "I just rebuilt" is not evidence).
Extension-host changes need **F5**; Cmd+R reloads only the webview.

To check a bundle, grep the **tool-name string literal**, never the registration function —
esbuild renames identifiers, so `grep registerContentAuthoringTools dist/extension.js` returns
0 on a perfectly good build.

## What else moves (the checklist)

- `dashboardHandlersMap.test.ts` pins the EXACT handler count — bump it with the
  arithmetic comment.
- `inExtensionMcpServer.test.ts` pins the `registerProjectTools` tool list BY NAME
  ("serves the N project tools over the socket") — add yours and update the count word.
- Descriptor suites: `readDescriptors`/`actionDescriptors`/`toolDescriptors` tests.
- `docs/systems/mcp-server.md` — the descriptor-driven tool list (§ "Descriptor-driven
  tools") and, if agent-facing behavior changed, the flow sections.
- If agents should DISCOVER the tool proactively, teach it: generated AGENTS.md section
  and/or a generated skill — that's `ai-context-authoring` territory (including the
  AI_CONTEXT_VERSION bump).
- Tool NAME/description are the agent's search surface: short snake_case name, one-line
  description saying WHEN to use it (deferred tool loading ranks on these).

## Logging

`withToolLogging` wraps every tool: name + arg KEYS only (args can carry secrets).
Never add value-logging inside a handler that tools reach.
