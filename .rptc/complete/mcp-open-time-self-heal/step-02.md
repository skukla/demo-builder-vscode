# Step 2 — `runMcpSelfHeal` orchestrator + wire into dashboard open

**Goal:** on dashboard open, if drift is detected for an EDS project, automatically + visibly run the
existing regenerate flow. Mirror the `runOrgContextCheck` seam exactly.

## Files

- Edit `src/features/dashboard/handlers/aiHandlers.ts` — add `runMcpSelfHeal` (export for the caller +
  tests, like `runOrgContextCheck` is exported). Reuse `handleRegenerateAiFiles` already in this file.
- Edit `src/features/dashboard/handlers/dashboardHandlers.ts` — in `handleRequestStatus`, after the
  status payload is sent and alongside `void runOrgContextCheck(...)`, add
  `void runMcpSelfHeal(context, project)`.
- Tests: `tests/features/dashboard/handlers/aiHandlers.test.ts` (extend) +
  `dashboardHandlers.test.ts` (assert the fire-and-forget call).

## `runMcpSelfHeal` behavior

```ts
export async function runMcpSelfHeal(context: HandlerContext, project: Project): Promise<void> {
  if (!isEdsProject(project)) return;                 // headless = no MCP tooling
  if (selfHealAlreadyRan(project.path)) return;        // per-session re-entrancy guard
  markSelfHealRan(project.path);
  try {
    const { drifted, missing } = await detectMcpDrift(project.path);
    if (!drifted) return;
    context.logger.warn(`[MCP Self-Heal] ${missing.length} stale MCP path(s) — regenerating`);
    context.panel?.webview.postMessage({ type: 'mcpSelfHealStarted', payload: { count: missing.length } });
    await handleRegenerateAiFiles(context);            // emits creationProgress; non-fatal
    context.panel?.webview.postMessage({ type: 'mcpSelfHealDone', payload: { ok: true } });
  } catch (err) {
    context.logger.warn(`[MCP Self-Heal] failed: ${(err as Error).message}`);
    context.panel?.webview.postMessage({ type: 'mcpSelfHealDone', payload: { ok: false } });
  }
}
```

- **Re-entrancy guard:** a module-level `Set<string>` of project paths healed this session (or reuse an
  existing session-state store). The webview re-requests status on reconnect; without the guard the
  heal could fire repeatedly. Reset semantics: per extension session is fine (a fresh window re-checks).
- **EDS gate** first so headless never pays the cost.
- **Non-fatal:** all wrapped; a heal failure posts `mcpSelfHealDone { ok: false }` and logs — never
  throws into `handleRequestStatus`.

## Tests (write FIRST)

- **drift + EDS → heals:** `detectMcpDrift` mocked drifted, `isEdsProject` true → `handleRegenerateAiFiles`
  called once; `mcpSelfHealStarted` then `mcpSelfHealDone {ok:true}` posted.
- **no drift → no heal:** drifted false → `handleRegenerateAiFiles` NOT called; no messages.
- **headless → skipped:** `isEdsProject` false → detect not even called; no heal.
- **re-entrancy:** two calls for the same project.path → heal runs at most once.
- **heal throws → swallowed:** `handleRegenerateAiFiles` rejects → no throw; `mcpSelfHealDone {ok:false}`
  posted; warning logged.
- **`handleRequestStatus` wiring:** asserts `runMcpSelfHeal` is invoked (fire-and-forget) and that the
  status response is returned without awaiting it (status not blocked).

## Constraints

- Mock `detectMcpDrift`, `isEdsProject`, and `handleRegenerateAiFiles` at the boundary; don't re-test
  their internals here.
- Keep the message-type names (`mcpSelfHealStarted` / `mcpSelfHealDone`) in sync with Step 3.
- Mirror `runOrgContextCheck`'s structure precisely (pending-style first message optional — Step 3
  decides whether `mcpSelfHealStarted` drives a spinner or we lean entirely on `creationProgress`).
