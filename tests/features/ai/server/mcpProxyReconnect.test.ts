/**
 * The proxy's reconnect POLICY — including the guard that stopped an EMFILE
 * cascade, which until now nothing tested.
 *
 * Node emits `close` after `error`, so a transient connect failure once ran both
 * handlers and each scheduled its own reconnect. The two timers opened two
 * sockets, whose failures scheduled two more, and the process climbed to EMFILE.
 * On the client it surfaced as `MCP error -32000: Connection closed` — a message
 * that says nothing about file descriptors.
 *
 * `decideOnClose(false) === none` is the whole fix. It reads like a redundant
 * condition, which is exactly why it needs a test that fails when someone
 * removes it.
 */

import {
    decideOnConnectError,
    decideOnClose,
    RETRY_DELAYS_MS,
    RECONNECT_PAUSE_MS,
} from '@/features/ai/server/mcpProxyReconnect';

describe('a socket that never connected does NOT schedule its own reconnect', () => {
    it('says nothing on close when connect never fired', () => {
        // THE EMFILE GUARD. If this ever returns a reconnect, a failing dial
        // schedules two retries, then four, then eight.
        expect(decideOnClose(false)).toEqual({ action: 'none' });
    });

    it('reconnects on close when the socket HAD connected', () => {
        // The other half: an established socket dropping means the extension
        // host restarted, and recovering from that is this handler's whole job.
        expect(decideOnClose(true)).toEqual({
            action: 'reconnect',
            delayMs: RECONNECT_PAUSE_MS,
        });
    });
});

describe('a transient error backs off and retries', () => {
    it('retries ENOENT — the server simply is not listening yet', () => {
        expect(decideOnConnectError('ENOENT', 'no such file', 0)).toEqual({
            action: 'retry',
            delayMs: RETRY_DELAYS_MS[0],
            nextAttempt: 1,
        });
    });

    it('walks the backoff schedule as attempts climb', () => {
        expect(decideOnConnectError('ECONNREFUSED', 'refused', 3)).toEqual({
            action: 'retry',
            delayMs: RETRY_DELAYS_MS[3],
            nextAttempt: 4,
        });
    });

    it('retries the FD-exhaustion codes rather than dying on them', () => {
        // EMFILE/ENFILE are the symptom the cascade above produced. They are
        // transient by nature, so the policy waits them out.
        for (const code of ['EMFILE', 'ENFILE']) {
            expect(decideOnConnectError(code, 'too many open files', 0).action).toBe('retry');
        }
    });
});

describe('it stops rather than retrying forever', () => {
    it('gives up once the schedule is exhausted', () => {
        const decision = decideOnConnectError('ENOENT', 'no such file', RETRY_DELAYS_MS.length);
        expect(decision.action).toBe('fail');
    });

    it('names where the server comes from when it gives up', () => {
        // The actionable part: "not running" is only useful if the reader learns
        // that opening VS Code is what starts it.
        const decision = decideOnConnectError('ENOENT', 'no such file', RETRY_DELAYS_MS.length);
        expect(decision).toMatchObject({ action: 'fail' });
        if (decision.action === 'fail') {
            expect(decision.message).toMatch(/not running/i);
            expect(decision.message).toMatch(/VS Code/);
        }
    });

    it('fails IMMEDIATELY on a non-transient error, however early the attempt', () => {
        // EACCES will not fix itself; retrying ten times just delays the report.
        const decision = decideOnConnectError('EACCES', 'permission denied', 0);
        expect(decision).toMatchObject({ action: 'fail' });
        if (decision.action === 'fail') {
            expect(decision.message).toContain('permission denied');
        }
    });

    it('treats an unknown code as non-transient — fail closed', () => {
        const decision = decideOnConnectError(undefined, 'mystery', 0);
        expect(decision.action).toBe('fail');
    });
});
