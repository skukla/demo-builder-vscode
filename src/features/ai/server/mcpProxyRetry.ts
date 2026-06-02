/**
 * Connect-error classifier for the MCP stdio→UDS proxy.
 *
 * The proxy's connect loop must distinguish transient failures (worth retrying
 * with backoff while the in-extension server boots or recovers) from terminal
 * failures (no point retrying — exit and let the user see the error).
 *
 * This helper is `net`-free and process-free so the policy can be unit-tested
 * without spawning a real socket. The proxy supplies `err.code` to the
 * classifier and reads the boolean answer.
 *
 * Why each code is on the list:
 *   - ENOENT          — socket file does not exist yet (server hasn't bound)
 *   - ECONNREFUSED    — socket file present but server isn't accepting (race)
 *   - EMFILE          — this process hit its file-descriptor soft limit.
 *                       Symptom of a reconnect-loop cascade where parallel
 *                       retry + close timers each opened a new socket. The
 *                       cascade is fixed at the call site; classifying EMFILE
 *                       as retryable is insurance for any residual pressure.
 *   - ENFILE          — system-wide file-descriptor table is full. Same
 *                       recovery as EMFILE; sometimes the OS surfaces ENFILE
 *                       where EMFILE would otherwise appear.
 *
 * Everything else (EACCES, ENOTSOCK, unexpected codes, undefined) returns
 * false — exit, surface the error, do not paper over a real problem with a
 * retry loop.
 */

const RETRYABLE_CODES: ReadonlySet<string> = new Set([
    'ENOENT',
    'ECONNREFUSED',
    'EMFILE',
    'ENFILE',
]);

/**
 * Returns true when a `net.connect` error code should drive another retry.
 * Accepts the bare error code (`err.code`) — pass it from the proxy's
 * `socket.on('error', ...)` handler.
 */
export function isRetryableConnectError(code: string | undefined): boolean {
    if (!code) return false;
    return RETRYABLE_CODES.has(code);
}
