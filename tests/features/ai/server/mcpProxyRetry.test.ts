/**
 * Tests for the MCP proxy's connect-error classifier.
 *
 * The proxy's reconnect loop has two layers:
 *   1. The error handler retries on transient codes during the initial connect
 *      window (server not up yet, file-descriptor pressure).
 *   2. The close handler reconnects after a previously-connected socket drops
 *      (extension reload).
 *
 * The classifier here drives layer 1: it answers "should we retry this error?"
 * without depending on `net` or process state, so the decision is fully unit-
 * testable. The original ENOENT/ECONNREFUSED set is preserved; EMFILE is added
 * to the retryable list because it is transient (the OS frees descriptors
 * shortly after) and previously fell through to a hard exit.
 */

import {
    isRetryableConnectError,
    isRetryableToolResult,
} from '@/features/ai/server/mcpProxyRetry';

describe('isRetryableConnectError', () => {
    it('returns true for ENOENT (server not listening yet)', () => {
        expect(isRetryableConnectError('ENOENT')).toBe(true);
    });

    it('returns true for ECONNREFUSED (server died, socket file still present)', () => {
        expect(isRetryableConnectError('ECONNREFUSED')).toBe(true);
    });

    it('returns true for EMFILE (process FD limit reached — transient)', () => {
        // EMFILE was the missing case: under reconnect-loop cascade we
        // exhausted FDs and exited hard with a confusing "MCP error -32000:
        // Connection closed" on the client side. EMFILE deserves the same
        // backoff-and-retry treatment as ENOENT/ECONNREFUSED.
        expect(isRetryableConnectError('EMFILE')).toBe(true);
    });

    it('returns true for ENFILE (system-wide FD limit reached — transient)', () => {
        // Sibling of EMFILE for the system-wide table; same recovery applies.
        expect(isRetryableConnectError('ENFILE')).toBe(true);
    });

    it('returns false for EACCES (permission — not transient, do not retry)', () => {
        expect(isRetryableConnectError('EACCES')).toBe(false);
    });

    it('returns false for undefined error code (unknown — fail closed)', () => {
        expect(isRetryableConnectError(undefined)).toBe(false);
    });

    it('returns false for an empty string error code', () => {
        expect(isRetryableConnectError('')).toBe(false);
    });
});

describe('isRetryableToolResult', () => {
    it('returns false for an ORG_MISMATCH tool result (do not retry into the same 403)', () => {
        expect(isRetryableToolResult({ error_type: 'ORG_MISMATCH', non_retryable: true })).toBe(false);
    });

    it('returns false for any result explicitly marked non_retryable', () => {
        expect(isRetryableToolResult({ error_type: 'SOMETHING', non_retryable: true })).toBe(false);
    });

    it('returns true for a result with no non-retryable marker (default retryable)', () => {
        expect(isRetryableToolResult({ created: true })).toBe(true);
    });

    it('returns true for an undefined / non-object result', () => {
        expect(isRetryableToolResult(undefined)).toBe(true);
        expect(isRetryableToolResult('done')).toBe(true);
    });
});
