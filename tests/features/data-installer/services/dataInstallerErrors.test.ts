/**
 * Tests for the Data Installer error taxonomy.
 *
 * The load-bearing assertion here is the anti-substring pin: transport failures
 * are classified STRUCTURALLY (error name, instanceof) and never by looking for
 * words in a message. `discoverStoreStructure`'s catch in `commerceStoreDiscovery.ts` records why — substring
 * matching collided with service-response bodies that happen to contain
 * "timeout" or "fetch failed", and this service's bodies are exactly that kind
 * of prose ("Collection name required. Provide <collection env var>...").
 */

import {
    DataInstallerApiError,
    DataInstallerInputError,
    classifyTransportError,
    describeApiFailure,
    isDataInstallerAuthError,
} from '@/features/data-installer/services/dataInstallerErrors';

describe('dataInstallerErrors', () => {
    describe('DataInstallerApiError', () => {
        it('carries the status and the action that failed', () => {
            const err = new DataInstallerApiError('boom', 404, 'find-datapacks');
            expect(err.status).toBe(404);
            expect(err.action).toBe('find-datapacks');
            expect(err.message).toBe('boom');
        });

        it('is a real Error, so instanceof and stack behave', () => {
            const err = new DataInstallerApiError('boom', 500, 'logs');
            expect(err).toBeInstanceOf(Error);
            expect(err).toBeInstanceOf(DataInstallerApiError);
            expect(err.name).toBe('DataInstallerApiError');
        });
    });

    describe('DataInstallerInputError', () => {
        it('is distinguishable from an API error, because it never reached the network', () => {
            const err = new DataInstallerInputError('data_types must not be empty');
            expect(err).toBeInstanceOf(Error);
            expect(err).toBeInstanceOf(DataInstallerInputError);
            expect(err).not.toBeInstanceOf(DataInstallerApiError);
            expect(err.name).toBe('DataInstallerInputError');
        });
    });

    describe('isDataInstallerAuthError', () => {
        it.each([401, 403])('is true for %i', (status) => {
            expect(isDataInstallerAuthError(new DataInstallerApiError('nope', status, 'logs'))).toBe(true);
        });

        it.each([400, 404, 409, 500, 502])('is false for %i', (status) => {
            expect(isDataInstallerAuthError(new DataInstallerApiError('nope', status, 'logs'))).toBe(false);
        });

        it('is false for a plain Error and for non-errors', () => {
            expect(isDataInstallerAuthError(new Error('401 unauthorized'))).toBe(false);
            expect(isDataInstallerAuthError('401')).toBe(false);
            expect(isDataInstallerAuthError(undefined)).toBe(false);
            expect(isDataInstallerAuthError(null)).toBe(false);
        });
    });

    describe('classifyTransportError', () => {
        it('classifies an aborted request as a timeout, by error NAME', () => {
            // AbortSignal.timeout() throws a DOMException whose name is AbortError.
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            expect(classifyTransportError(err)).toBe('timeout');
        });

        it("classifies Node fetch's TypeError('fetch failed') as unreachable", () => {
            expect(classifyTransportError(new TypeError('fetch failed'))).toBe('unreachable');
        });

        it('classifies anything else as unknown', () => {
            expect(classifyTransportError(new Error('something else'))).toBe('unknown');
            expect(classifyTransportError('a string')).toBe('unknown');
            expect(classifyTransportError(undefined)).toBe('unknown');
        });

        // The pin. Both directions.
        it('does NOT call it a timeout just because the message says "timeout"', () => {
            expect(classifyTransportError(new Error('Gateway timeout while processing'))).toBe('unknown');
        });

        it('does NOT call it unreachable just because the message says "fetch failed"', () => {
            // A plain Error, not a TypeError — the type is half the signal.
            expect(classifyTransportError(new Error('fetch failed'))).toBe('unknown');
        });

        it('does NOT reclassify an API error whose BODY text mentions timeout', () => {
            // This is the real collision: a 500 whose response body is prose.
            const err = new DataInstallerApiError(
                'process-datapack: 500 Internal Server Error — upstream timeout contacting Commerce',
                500,
                'process-datapack',
            );
            expect(classifyTransportError(err)).toBe('unknown');
        });
    });

    describe('describeApiFailure', () => {
        it('folds action, status, statusText and body into one line', () => {
            expect(
                describeApiFailure('find-datapacks', 401, 'Unauthorized', '{"error":"Authentication required"}'),
            ).toBe('find-datapacks: 401 Unauthorized — {"error":"Authentication required"}');
        });

        it('says so explicitly when the body is empty, rather than trailing a dash', () => {
            expect(describeApiFailure('logs', 500, 'Internal Server Error', '')).toBe(
                'logs: 500 Internal Server Error — (empty body)',
            );
        });

        it('truncates a very long body so one bad response cannot flood a log line', () => {
            const msg = describeApiFailure('logs', 500, 'Internal Server Error', 'x'.repeat(5000));
            expect(msg.length).toBeLessThan(1000);
            expect(msg).toContain('truncated');
        });

        it('collapses newlines so the message stays one log line', () => {
            const msg = describeApiFailure('logs', 400, 'Bad Request', 'line one\nline two\r\nline three');
            expect(msg).not.toMatch(/[\r\n]/);
            expect(msg).toContain('line one');
            expect(msg).toContain('line three');
        });
    });
});
