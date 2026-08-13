/**
 * Tests for the Data Installer read client.
 *
 * The client is the only place that talks HTTP, and it imports no `vscode` — so
 * everything here runs with an injected `fetchImpl` and a stub token provider,
 * with no VS Code mocks at all.
 *
 * Three assertions are load-bearing rather than routine:
 *   - the token never reaches a thrown message (public repo, and errors get logged),
 *   - `batchGetDataItems` with no data types refuses BEFORE the network, because
 *     omitting them trips a live server-side 400,
 *   - health-check carries no Authorization header, since it is the one endpoint
 *     that must work when the token is dead.
 */

import * as path from 'path';

import { DataInstallerClient } from '@/features/data-installer/services/dataInstallerClient';
import {
    DataInstallerApiError,
    DataInstallerInputError,
    isDataInstallerAuthError,
} from '@/features/data-installer/services/dataInstallerErrors';

const FIXTURES = path.join(__dirname, '../../../fixtures/data-installer');
const load = (name: string): unknown => require(path.join(FIXTURES, name));

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

function makeClient(fetchImpl: jest.Mock, extra: Record<string, unknown> = {}): DataInstallerClient {
    return new DataInstallerClient({
        baseUrl: BASE,
        getToken: async () => TOKEN,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        ...extra,
    });
}

/** The (url, init) pair the client passed to fetch on its Nth call. */
function callArgs(fetchImpl: jest.Mock, n = 0): { url: string; init: RequestInit } {
    const [url, init] = fetchImpl.mock.calls[n];
    return { url: String(url), init: (init ?? {}) as RequestInit };
}

function headerOf(init: RequestInit, name: string): string | undefined {
    return (init.headers as Record<string, string> | undefined)?.[name];
}

describe('DataInstallerClient', () => {
    describe('request shape', () => {
        it('sends the bearer token on an authenticated read', async () => {
            const f = jsonFetch(load('find-datapacks.json'));
            await makeClient(f).findDatapacks({});
            expect(headerOf(callArgs(f).init, 'Authorization')).toBe(`Bearer ${TOKEN}`);
        });

        it('sends NO Authorization header on health-check', async () => {
            // Health must answer even when the token is expired — that is what
            // makes it useful for telling "our auth" apart from "their outage".
            const f = jsonFetch(load('health-check.json'));
            await makeClient(f).checkHealth();
            expect(headerOf(callArgs(f).init, 'Authorization')).toBeUndefined();
        });

        it('puts the action in the last path segment', async () => {
            const f = jsonFetch(load('find-datapacks.json'));
            await makeClient(f).findDatapacks({});
            expect(callArgs(f).url).toContain('/data-installer-api/find-datapacks');
        });

        it('appends a path parameter for the status endpoints', async () => {
            const f = jsonFetch(load('datapack-process-status-complete.json'));
            await makeClient(f).getJobStatus('activation-01');
            expect(callArgs(f).url).toContain('/datapack-process-status/activation-01');
        });

        it('serializes query parameters and omits the empty ones', async () => {
            const f = jsonFetch(load('find-datapacks.json'));
            await makeClient(f).findDatapacks({ shared: true, limit: 50, datapackName: undefined });
            const { url } = callArgs(f);
            expect(url).toContain('shared=true');
            expect(url).toContain('limit=50');
            expect(url).not.toContain('datapack_name');
        });

        it('attaches an abort signal so a hung request cannot wedge the UI', async () => {
            const f = jsonFetch(load('find-datapacks.json'));
            await makeClient(f).findDatapacks({});
            expect(callArgs(f).init.signal).toBeDefined();
        });

        it('resolves the token per request, since tokens expire mid-session', async () => {
            const f = jsonFetch(load('find-datapacks.json'));
            const getToken = jest.fn().mockResolvedValue(TOKEN);
            const client = new DataInstallerClient({
                baseUrl: BASE,
                getToken,
                fetchImpl: f as unknown as typeof fetch,
            });
            await client.findDatapacks({});
            await client.findDatapacks({});
            expect(getToken).toHaveBeenCalledTimes(2);
        });

        it('POSTs a JSON body for batch reads', async () => {
            const f = jsonFetch(load('batch-ok.json'));
            await makeClient(f).batchGetDataItems({ name: 'citisignal_new', version: 'main' }, ['categories']);
            const { init } = callArgs(f);
            expect(init.method).toBe('POST');
            expect(headerOf(init, 'Content-Type')).toBe('application/json');
            expect(JSON.parse(String(init.body))).toMatchObject({
                datapack_name: 'citisignal_new',
                version: 'main',
                data_types: ['categories'],
            });
        });
    });

    describe('returns domain objects, never wire shapes', () => {
        it('normalizes the catalog through the parsers', async () => {
            const page = await makeClient(jsonFetch(load('find-datapacks.json'))).findDatapacks({});
            expect(page.items[0].id).toHaveProperty('name');
            expect(JSON.stringify(page.items)).not.toContain('datapack_name');
        });

        it('normalizes a data item, parsing the JSON string payload', async () => {
            const item = await makeClient(jsonFetch(load('get-data-item.json'))).getDataItem(
                { name: 'citisignal_new', version: 'main' },
                'categories',
            );
            expect(typeof item.records).toBe('object');
        });

        it('reads a job status as a per-type map with hasRecord', async () => {
            const snap = await makeClient(jsonFetch(load('datapack-process-status-complete.json'))).getJobStatus('a');
            expect(snap.hasRecord).toBe(true);
            expect(Object.keys(snap.perType)).toHaveLength(7);
        });
    });

    describe('the server-side batch defect', () => {
        it('refuses an empty data_types list WITHOUT issuing a request', async () => {
            // Omitting data_types trips a 400 on the deployed service. We never
            // send the request that trips it.
            const f = jsonFetch(load('batch-ok.json'));
            const client = makeClient(f);
            await expect(
                client.batchGetDataItems({ name: 'x', version: 'main' }, []),
            ).rejects.toBeInstanceOf(DataInstallerInputError);
            expect(f).not.toHaveBeenCalled();
        });

        it('names the constraint in the message, so a future reader knows why', async () => {
            const client = makeClient(jsonFetch({}));
            await expect(
                client.batchGetDataItems({ name: 'x', version: 'main' }, []),
            ).rejects.toThrow(/data_types/);
        });
    });

    describe('failure handling', () => {
        it('throws a typed error carrying the status and the action', async () => {
            const f = jsonFetch({ success: false, error: 'Authentication required' }, 401, 'Unauthorized');
            const err = await makeClient(f).findDatapacks({}).catch((e: unknown) => e);
            expect(err).toBeInstanceOf(DataInstallerApiError);
            expect((err as DataInstallerApiError).status).toBe(401);
            expect((err as DataInstallerApiError).action).toBe('find-datapacks');
            expect(isDataInstallerAuthError(err)).toBe(true);
        });

        it('folds status, statusText and body into the message', async () => {
            const f = jsonFetch({ success: false, error: 'Authentication required' }, 401, 'Unauthorized');
            const err = (await makeClient(f).findDatapacks({}).catch((e: unknown) => e)) as Error;
            expect(err.message).toContain('find-datapacks');
            expect(err.message).toContain('401');
            expect(err.message).toContain('Authentication required');
        });

        it('handles a non-JSON error body without throwing a parse error', async () => {
            const f = textFetch('<html>502 Bad Gateway</html>', 502, 'Bad Gateway');
            const err = (await makeClient(f).findDatapacks({}).catch((e: unknown) => e)) as Error;
            expect(err).toBeInstanceOf(DataInstallerApiError);
            expect(err.message).toContain('502');
        });

        it('NEVER puts the token in a thrown message', async () => {
            // Errors get logged; a token in one is a leak in a public repo.
            const f = jsonFetch({ success: false, error: 'nope' }, 500, 'Internal Server Error');
            const err = (await makeClient(f).findDatapacks({}).catch((e: unknown) => e)) as Error;
            expect(err.message).not.toContain(TOKEN);
            expect(JSON.stringify(err)).not.toContain(TOKEN);
        });

        it('reports a timeout in terms a user can act on', async () => {
            const abort = new Error('aborted');
            abort.name = 'AbortError';
            const f = jest.fn().mockRejectedValue(abort);
            await expect(makeClient(f).findDatapacks({})).rejects.toThrow(/timed out/i);
        });

        it('reports an unreachable service distinctly from a timeout', async () => {
            const f = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
            await expect(makeClient(f).findDatapacks({})).rejects.toThrow(/could not reach|unreachable/i);
        });

        it('does not misclassify a 500 whose body text mentions timeout', async () => {
            const f = jsonFetch({ error: 'upstream timeout contacting Commerce' }, 500, 'Internal Server Error');
            const err = (await makeClient(f).findDatapacks({}).catch((e: unknown) => e)) as Error;
            expect(err).toBeInstanceOf(DataInstallerApiError);
            expect((err as DataInstallerApiError).status).toBe(500);
        });
    });

    describe('drift canary', () => {
        it('reports a missing expected key once per endpoint', async () => {
            const onDrift = jest.fn();
            // `datapacks` gone: the shape moved under us.
            const f = jsonFetch({ success: true, count: 0 });
            const client = makeClient(f, { onDrift });
            await client.findDatapacks({});
            await client.findDatapacks({});
            expect(onDrift).toHaveBeenCalledTimes(1);
            expect(onDrift).toHaveBeenCalledWith('find-datapacks', expect.arrayContaining(['datapacks']));
        });

        it('stays silent when the shape is intact', async () => {
            const onDrift = jest.fn();
            await makeClient(jsonFetch(load('find-datapacks.json')), { onDrift }).findDatapacks({});
            expect(onDrift).not.toHaveBeenCalled();
        });

        it('reports key NAMES only — never a value', async () => {
            const onDrift = jest.fn();
            const f = jsonFetch({ success: true, secret_field: TOKEN });
            await makeClient(f, { onDrift }).findDatapacks({});
            expect(JSON.stringify(onDrift.mock.calls)).not.toContain(TOKEN);
        });

        it('does not fail the request when drift is detected', async () => {
            const page = await makeClient(jsonFetch({ success: true, count: 0 }), {
                onDrift: jest.fn(),
            }).findDatapacks({});
            expect(page.items).toEqual([]);
        });
    });
});
