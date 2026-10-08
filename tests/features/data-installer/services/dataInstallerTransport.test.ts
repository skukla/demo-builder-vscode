/**
 * The wire layer under the Data Installer read client.
 *
 * Moved out of `dataInstallerClient.test.ts` when the transport got its own
 * module (2026-10-08): these pin how ONE request travels — failures mapped to a
 * typed error that never carries the token, a timeout told apart from an
 * unreachable host, and the shape-drift canary that fires once per endpoint and
 * names keys only. The endpoint suites next door pin what each endpoint sends.
 *
 * No `vscode` anywhere: an injected `fetchImpl` and a stub token provider.
 */

import {
    DataInstallerTransport,
    resetDriftReported,
} from '@/features/data-installer/services/dataInstallerTransport';
import {
    DataInstallerApiError,
    isDataInstallerAuthError,
} from '@/features/data-installer/services/dataInstallerErrors';

const BASE = 'https://example-namespace.adobeioruntime.net/api/v1/web/data-installer-api';
const TOKEN = 'a-very-secret-bearer-token-value';

/** A fetch stub that returns one JSON body with the given status. */
function jsonFetch(body: unknown, status = 200, statusText = 'OK'): jest.Mock {
    return jest.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        statusText,
        text: async () => JSON.stringify(body),
    });
}

/** A fetch stub that returns a raw (non-JSON) body. */
function textFetch(text: string, status: number, statusText: string): jest.Mock {
    return jest.fn().mockResolvedValue({
        ok: false,
        status,
        statusText,
        text: async () => text,
    });
}

/** A fetch stub whose SUCCESS body is not JSON at all. */
function okTextFetch(text: string): jest.Mock {
    return jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => text,
    });
}

function makeTransport(
    fetchImpl: jest.Mock,
    extra: Record<string, unknown> = {},
): DataInstallerTransport {
    return new DataInstallerTransport({
        baseUrl: BASE,
        getToken: async () => TOKEN,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        ...extra,
    });
}

describe('DataInstallerTransport', () => {
    beforeEach(() => {
        resetDriftReported();
    });

    describe('failure handling', () => {
        it('throws a typed error carrying the status and the action', async () => {
            const f = jsonFetch({ success: false, error: 'Authentication required' }, 401, 'Unauthorized');
            const err = await makeTransport(f).request('find-datapacks').catch((e: unknown) => e);
            expect(err).toBeInstanceOf(DataInstallerApiError);
            expect((err as DataInstallerApiError).status).toBe(401);
            expect((err as DataInstallerApiError).action).toBe('find-datapacks');
            expect(isDataInstallerAuthError(err)).toBe(true);
        });

        it('folds status, statusText and body into the message', async () => {
            const f = jsonFetch({ success: false, error: 'Authentication required' }, 401, 'Unauthorized');
            const err = (await makeTransport(f).request('find-datapacks').catch((e: unknown) => e)) as Error;
            expect(err.message).toContain('find-datapacks');
            expect(err.message).toContain('401');
            expect(err.message).toContain('Authentication required');
        });

        it('handles a non-JSON error body without throwing a parse error', async () => {
            const f = textFetch('<html>502 Bad Gateway</html>', 502, 'Bad Gateway');
            const err = (await makeTransport(f).request('find-datapacks').catch((e: unknown) => e)) as Error;
            expect(err).toBeInstanceOf(DataInstallerApiError);
            expect(err.message).toContain('502');
        });

        it('NEVER puts the token in a thrown message', async () => {
            // Errors get logged; a token in one is a leak in a public repo.
            const f = jsonFetch({ success: false, error: 'nope' }, 500, 'Internal Server Error');
            const err = (await makeTransport(f).request('find-datapacks').catch((e: unknown) => e)) as Error;
            expect(err.message).not.toContain(TOKEN);
            expect(JSON.stringify(err)).not.toContain(TOKEN);
        });

        it('reports a timeout in terms a user can act on', async () => {
            const abort = new Error('aborted');
            abort.name = 'AbortError';
            const f = jest.fn().mockRejectedValue(abort);
            await expect(makeTransport(f).request('find-datapacks')).rejects.toThrow(/timed out/i);
        });

        it('reports the timeout in SECONDS, not milliseconds', async () => {
            const abort = new Error('aborted');
            abort.name = 'AbortError';
            const f = jest.fn().mockRejectedValue(abort);

            await expect(
                makeTransport(f, { timeoutMs: 5000 }).request('find-datapacks'),
            ).rejects.toThrow(/timed out after 5s/);
        });

        it('reports an unreachable service distinctly from a timeout', async () => {
            const f = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
            await expect(makeTransport(f).request('find-datapacks')).rejects.toThrow(
                /could not reach|unreachable/i,
            );
        });

        it('does not call an unclassifiable transport failure unreachable', async () => {
            // Only a TypeError('fetch failed') means unreachable. Anything else
            // keeps its own message, or a network hiccup gets blamed on the URL
            // setting and the user edits something that was never wrong.
            const f = jest.fn().mockRejectedValue(new Error('socket hang up'));

            const err = (await makeTransport(f).request('find-datapacks').catch((e: unknown) => e)) as Error;

            expect(err.message).toContain('socket hang up');
            expect(err.message).not.toContain('could not reach');
        });

        it('still names the action when fetch rejects with something that is not an Error', async () => {
            const f = jest.fn().mockRejectedValue('offline');

            const err = (await makeTransport(f).request('logs').catch((e: unknown) => e)) as Error;

            expect(err).toBeInstanceOf(DataInstallerApiError);
            expect(err.message).toContain('logs');
            expect((err as DataInstallerApiError).status).toBe(0);
        });

        it('does not misclassify a 500 whose body text mentions timeout', async () => {
            const f = jsonFetch({ error: 'upstream timeout contacting Commerce' }, 500, 'Internal Server Error');
            const err = (await makeTransport(f).request('find-datapacks').catch((e: unknown) => e)) as Error;
            expect(err).toBeInstanceOf(DataInstallerApiError);
            expect((err as DataInstallerApiError).status).toBe(500);
        });

        it('names the action a transport failure belongs to, with no HTTP status', async () => {
            const f = jest.fn().mockRejectedValue(new Error('socket hang up'));

            const err = await makeTransport(f).request('logs').catch((e: unknown) => e);

            expect(err).toBeInstanceOf(DataInstallerApiError);
            expect((err as DataInstallerApiError).action).toBe('logs');
            expect((err as DataInstallerApiError).status).toBe(0);
        });
    });

    describe('what a request carries', () => {
        it('sends the bearer by default and none when auth is false', async () => {
            const f = jsonFetch({ status: 'ok' });
            const transport = makeTransport(f);

            await transport.request('find-datapacks');
            await transport.request('health-check', { auth: false });

            const header = (n: number) =>
                (f.mock.calls[n][1].headers as Record<string, string>).Authorization;
            expect(header(0)).toBe(`Bearer ${TOKEN}`);
            expect(header(1)).toBeUndefined();
        });

        it('is a GET unless told otherwise, and a POST with a JSON body when told', async () => {
            const f = jsonFetch({ datapacks: [] });
            const transport = makeTransport(f);

            await transport.request('find-datapacks');
            await transport.request('batch-get-data-items', { method: 'POST', body: { a: 1 } });

            expect(f.mock.calls[0][1].method).toBe('GET');
            expect(f.mock.calls[1][1].method).toBe('POST');
            expect(f.mock.calls[1][1].body).toBe('{"a":1}');
        });

        it('resolves the token per request, since tokens expire mid-session', async () => {
            const f = jsonFetch({ datapacks: [] });
            const getToken = jest.fn().mockResolvedValue(TOKEN);
            const transport = makeTransport(f, { getToken });

            await transport.request('find-datapacks');
            await transport.request('find-datapacks');

            expect(getToken).toHaveBeenCalledTimes(2);
        });

        it('returns the parsed body, and the raw text when the body is not JSON', async () => {
            expect(await makeTransport(jsonFetch({ datapacks: [1] })).request('find-datapacks')).toEqual(
                { datapacks: [1] },
            );
            expect(await makeTransport(okTextFetch('plain')).request('find-datapacks')).toBe('plain');
        });
    });

    describe('drift canary', () => {
        it('reports a missing expected key once per endpoint', async () => {
            const onDrift = jest.fn();
            // `datapacks` gone: the shape moved under us.
            const f = jsonFetch({ success: true, count: 0 });
            const transport = makeTransport(f, { onDrift });
            await transport.request('find-datapacks');
            await transport.request('find-datapacks');
            expect(onDrift).toHaveBeenCalledTimes(1);
            expect(onDrift).toHaveBeenCalledWith('find-datapacks', expect.arrayContaining(['datapacks']));
        });

        it('stays silent when the shape is intact', async () => {
            const onDrift = jest.fn();
            await makeTransport(jsonFetch({ datapacks: [] }), { onDrift }).request('find-datapacks');
            expect(onDrift).not.toHaveBeenCalled();
        });

        it('stays silent when nobody is listening', async () => {
            // No onDrift: the shape is still parsed and returned, nothing is reported.
            const body = await makeTransport(jsonFetch({ success: true })).request('find-datapacks');
            expect(body).toEqual({ success: true });
        });

        it('reports key NAMES only — never a value', async () => {
            const onDrift = jest.fn();
            const f = jsonFetch({ success: true, secret_field: TOKEN });
            await makeTransport(f, { onDrift }).request('find-datapacks');
            // Guard: a not.toContain on an EMPTY call list passes for the wrong
            // reason. The dedupe is module-scoped, so without the reset in
            // beforeEach an earlier test silences this endpoint and this
            // assertion proves nothing.
            expect(onDrift).toHaveBeenCalled();
            expect(JSON.stringify(onDrift.mock.calls)).not.toContain(TOKEN);
        });

        it('does not fail the request when drift is detected', async () => {
            const body = await makeTransport(jsonFetch({ success: true, count: 0 }), {
                onDrift: jest.fn(),
            }).request('find-datapacks');
            expect(body).toEqual({ success: true, count: 0 });
        });

        /** Each endpoint that declares expected keys. */
        it.each([
            ['find-datapacks', ['datapacks']],
            ['get-datapack-metadata', ['datapack_name', 'display_name']],
            ['get-data-item', ['data']],
            ['batch-get-data-items', ['results']],
            ['get-export-data-types', ['data_types']],
            ['get-processor-order', ['processors']],
            ['get-installed-datapacks', ['datapacks']],
            ['logs', ['logs']],
        ])('names exactly the missing keys for %s', async (action, keys) => {
            const onDrift = jest.fn();

            await makeTransport(jsonFetch({ success: true }), { onDrift }).request(action);

            expect(onDrift).toHaveBeenCalledWith(action, keys);
        });

        it('checks no shape for an endpoint it holds no expectation for', async () => {
            // datapack-process-status declares no expected keys. The guard is what
            // stops the check reading `.filter` off undefined and failing a call
            // that was perfectly fine.
            const onDrift = jest.fn();

            const body = await makeTransport(jsonFetch({ success: true }), { onDrift }).request(
                'datapack-process-status',
                { pathParam: 'a' },
            );

            expect(onDrift).not.toHaveBeenCalled();
            expect(body).toEqual({ success: true });
        });

        it('reports drift when the body is JSON null rather than crashing', async () => {
            const onDrift = jest.fn();

            await makeTransport(jsonFetch(null), { onDrift }).request('find-datapacks');

            expect(onDrift).toHaveBeenCalledWith('find-datapacks', ['datapacks']);
        });

        it('reports drift when a 200 body is not JSON at all', async () => {
            // A maintenance page served with a 200 parses to its own text. That is
            // drift — the keys are gone — and not a parse crash.
            const onDrift = jest.fn();

            await makeTransport(okTextFetch('<html>maintenance</html>'), { onDrift }).request(
                'find-datapacks',
            );

            expect(onDrift).toHaveBeenCalledWith('find-datapacks', ['datapacks']);
        });
    });
});
