# Step 01 — The dry-run gate (server-enforced)

**Ships:** mutation becomes *impossible* while the mode is on, not discouraged.
**Depends on:** nothing. Start here.
**Branch:** `feature/evaluation-mode-dry-run`

## Why server-enforced

A dry run that occasionally is not dry gets trusted, and is therefore worse than
no dry run. Guidance loses to competing signals — the reason the `aio` guard
shipped 2026-08-24 as a blocking hook rather than a skill. The gate must make the
handler unreachable.

## The seam to copy

`consentGate` in `src/features/ai/server/inExtensionMcpServer.ts`
(`withToolLogging`, ~line 71) already is this shape: **injected** (so the module
stays vscode-free), consulted **before** the handler, and able to **short-circuit
a call and return its own answer**. The dry-run gate is its sibling.

Read it before writing anything. Wire from `extension.ts` exactly as
`createAgentConsentGate` is wired.

## Build

1. **The gate.** A `dryRun?: () => boolean` (or a small verdict object, matching
   `ConsentVerdict`'s shape if that reads better) added to
   `InExtensionMcpServerOptions`.
2. **Classification: reuse `isReadOnlyToolName`.** It already decides which calls
   are read-shaped — the progress notifier uses it. Do NOT add a second
   classification; two will drift.
   - Read-shaped tools execute normally. The path is only realistic if they do.
   - Everything else returns a synthetic result and never reaches the handler.
3. **The synthetic result is DATA, not an error.** The datapack dry run states
   the rule: *"a refusal comes back as `valid:false` with a reason, not as an
   error."* An error teaches the agent to retry; data teaches it what would
   happen. Name the tool and its argument **KEYS** (never values — args carry
   secrets, the same reason `withToolLogging` logs keys only).
4. **Gate ordering — dry run wins over consent.** A call carrying `confirm: true`
   under dry run must be blocked by the dry run and must NOT raise a consent
   dialog. Asking a user to approve something that will not happen is worse than
   not asking.
5. **The toggle.** A setting read **live** per call, same shape as
   `demoBuilder.ai.requireAgentConsent` (which is read fresh so it cannot go
   stale), plus a status bar item — precedent `src/core/build/buildStampUi.ts` —
   and a command. The status bar is not decoration: a mode you cannot see is a
   trap, because the user would ask for a deploy, be told "done", and believe it.

## Tests — by EXECUTION, never by reading the flag

The git-sync hook read an env var Claude Code never sets, did nothing on every
EDS project ever generated, and shipped because its tests asserted the command
*string*. Do not repeat that shape.

Drive the real server through `SocketRpc`
(`tests/features/ai/server/inExtensionMcpServer.testUtils.ts`, the same helper
`inExtensionMcpServer.test.ts` uses) and assert:

- a **mutating** tool does NOT reach its handler under dry run (spy the handler;
  assert zero calls) and the caller gets the synthetic result;
- a **read** tool DOES reach its handler under dry run;
- with the mode **off**, the mutating tool reaches its handler normally — the
  two-sided case, or the gate could be permanently on and every test still pass;
- a `confirm: true` call under dry run is blocked by the dry run and raises **no**
  consent dialog;
- the synthetic result carries argument KEYS and **no argument values** — assert
  a planted secret value does not appear.

## Done when

- All of the above green, driven through the real server.
- `gate` clean; whole-repo `npm run lint` before pushing.
- The mode is visibly indicated while on.
- No vscode import added to `inExtensionMcpServer.ts` — it stays injectable.

## Explicitly not in this step

The recorder (step 02), the runner or `evaluate_prompt` (step 03), any UI beyond
the status bar indicator (step 04).
