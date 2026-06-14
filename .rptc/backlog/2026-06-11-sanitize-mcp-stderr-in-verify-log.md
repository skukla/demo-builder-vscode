# Sanitize the MCP stderr tail before logging it in AI verification

## Provenance

Flagged by the `rptc:security-agent` (confidence 45, below the report threshold) during verification of the AI-verification/store-discovery observability pass (.116). Reported as a forward-looking hardening note, not an active vulnerability.

## Goal / Scope

`handleVerifyAiSetup` logs each MCP server's `entry.error` — the captured child-process stderr tail — via `context.logger.warn` (`src/features/dashboard/handlers/aiHandlers.ts`, the `logAiVerification` helper). `info`/`warn` do NOT pass through `sanitizeErrorForLogging` (only `error()` and `trace()` redact — see `src/core/logging/debugLogger.ts`).

For the extension-**generated** `.claude/mcp.json` this is safe: the three generated servers (`demo-builder`, `commerce-extensibility`, `playwright`) carry no secret-bearing env, and the MCP inspector's SDK env allowlist deliberately excludes host secrets (`GITHUB_TOKEN`, `DA_LIVE_IMS_TOKEN`, `AIO_*`). 

**Residual risk:** if a user manually adds a credential-bearing env to a third-party MCP server in `.claude/mcp.json`, AND that server echoes its environment to stderr on a startup crash, the secret could land in the ~4KB stderr tail and be written to the User Logs channel unredacted.

## Execution plan

- Wrap the stderr tail in `sanitizeErrorForLogging()` before logging: `context.logger.warn(\`[AI Verify] mcp ${entry.id}: ${entry.status}\\n${sanitizeErrorForLogging(entry.error ?? '')}\`)`. OR route the stderr body through `debugLogger.trace()` (which already sanitizes) while keeping the status line at `warn`.
- Weigh against diagnostic value: the raw stderr tail is the signal we added for the #2 MCP-timeout investigation — sanitization must not strip the socket-path / connect-error detail (it won't; those don't match secret patterns). Confirm with a test that a known-good stderr tail survives sanitization while a planted secret pattern is redacted.

## Constraints

- Keep the socket-path / connect-error diagnostic intact (it's load-bearing for diagnosing the MCP timeout).
- Low priority — no active leak in the generated config; defense-in-depth for user-modified configs.

## Kickoff prompt

> Sanitize the MCP child stderr tail before it's logged in `handleVerifyAiSetup` / `logAiVerification` (`aiHandlers.ts`) — wrap `entry.error` in `sanitizeErrorForLogging()` (or move the body to `debugLogger.trace`). Ensure the socket-path/connect-error diagnostic survives. See `.rptc/backlog/2026-06-11-sanitize-mcp-stderr-in-verify-log.md`.
