/**
 * When the proxy retries, waits, gives up, or says nothing — the POLICY half of
 * `mcp-proxy.ts`'s connect loop.
 *
 * WHY IT IS SEPARATE. What remained in `mcp-proxy.ts` after the session state
 * machine moved out was not all I/O. These decisions are pure — given an error
 * code, an attempt number, and whether this socket ever connected, what should
 * happen — and one of them has already caused a production incident.
 *
 * THE INCIDENT, preserved because the guard looks removable and is not. Node
 * emits `close` after `error`, so a transient connect failure once ran BOTH
 * handlers, each scheduling its own reconnect. The two timers opened two
 * sockets, whose failures each scheduled two more, and the process climbed to
 * EMFILE. On the client it presented as `MCP error -32000: Connection closed` —
 * a message that says nothing about file descriptors and sent everyone looking
 * in the wrong place.
 *
 * The fix is `connectedThisCycle`: only a socket that ACTUALLY connected may
 * schedule a reconnect from its close handler. Everything else is the error
 * handler's business. That is a one-line condition guarding a doubling cascade,
 * and it deserves a test that fails if anyone simplifies it away.
 */

import { isRetryableConnectError } from './mcpProxyRetry';

/** Backoff before each retry, indexed by attempt. Length caps the attempts. */
export const RETRY_DELAYS_MS = [250, 500, 1000, 1500, 2000, 2000, 3000, 3000, 5000, 5000];

/** Pause before re-dialling after the server dropped an established socket. */
export const RECONNECT_PAUSE_MS = 250;

export type ConnectDecision =
    /** Wait, then dial again as the same attempt sequence. */
    | { action: 'retry'; delayMs: number; nextAttempt: number }
    /** Stop, tell the user, exit non-zero. */
    | { action: 'fail'; message: string }
    /** Wait, then dial again as a RECONNECT (handshake replay applies). */
    | { action: 'reconnect'; delayMs: number }
    /** Do nothing — someone else owns the retry for this cycle. */
    | { action: 'none' };

/**
 * A connect attempt failed.
 *
 * @param code - `err.code` from the socket error.
 * @param message - `err.message`, used only in the non-retryable text.
 * @param attempt - 0-based; the backoff schedule's length is the ceiling.
 */
export function decideOnConnectError(
    code: string | undefined,
    message: string,
    attempt: number,
): ConnectDecision {
    if (isRetryableConnectError(code) && attempt < RETRY_DELAYS_MS.length) {
        return { action: 'retry', delayMs: RETRY_DELAYS_MS[attempt], nextAttempt: attempt + 1 };
    }
    if (isRetryableConnectError(code)) {
        // Out of attempts on a transient error: the server is not coming up, and
        // the actionable thing is to say where it comes FROM.
        return {
            action: 'fail',
            message:
                'Demo Builder MCP server is not running. Open this project in VS Code ' +
                '(the Demo Builder extension hosts the MCP server), then retry.\n',
        };
    }
    return { action: 'fail', message: `Demo Builder MCP proxy error: ${message}\n` };
}

/**
 * A socket closed.
 *
 * @param connectedThisCycle - did THIS socket ever emit 'connect'? If not, the
 *   error handler already owns the retry and this must stay out of it. See the
 *   incident at the top of this file.
 */
export function decideOnClose(connectedThisCycle: boolean): ConnectDecision {
    return connectedThisCycle
        ? { action: 'reconnect', delayMs: RECONNECT_PAUSE_MS }
        : { action: 'none' };
}
