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
import { resetDriftReported } from '@/features/data-installer/services/dataInstallerClient';

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

/** A fetch stub whose SUCCESS body is not JSON at all. */
function okTextFetch(text: string): jest.Mock {
    return jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
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
    beforeEach(() => {
        resetDriftReported();
    });

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

    /**
     * A 404 from `datapack-process-status` is an ANSWER, not an error: the live
     * service returns it for the first ~15s after a 202, before the worker
     * registers the activation — its body says "No request log found". Throwing
     * here bypassed the runner's grace/never-registered logic entirely (the
     * design keyed on a 200-with-empty-map, which is what an INVALID job
     * returns) and spammed five error lines into a healthy run's Debug Logs.
     */
    describe('the pre-registration 404', () => {
        it('maps a status 404 to hasRecord: false rather than throwing', async () => {
            const f = jsonFetch({ error: 'No request log found for this activation_id' }, 404, 'Not Found');

            const snap = await makeClient(f).getJobStatus('fresh-activation');

            expect(snap.hasRecord).toBe(false);
            expect(snap.perType).toEqual({});
        });

        it('still throws on a 404 from any OTHER action', async () => {
            const f = jsonFetch({ error: 'nope' }, 404, 'Not Found');

            const err = await makeClient(f).findDatapacks({}).catch((e: unknown) => e);

            expect(err).toBeInstanceOf(DataInstallerApiError);
        });

        it('still throws on a non-404 status failure', async () => {
            const f = jsonFetch({ error: 'boom' }, 500, 'Internal Server Error');

            const err = await makeClient(f).getJobStatus('a').catch((e: unknown) => e);

            expect(err).toBeInstanceOf(DataInstallerApiError);
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
            // Guard: a not.toContain on an EMPTY call list passes for the wrong
            // reason. The dedupe is module-scoped, so without the reset in
            // beforeEach an earlier test silences this endpoint and this
            // assertion proves nothing.
            expect(onDrift).toHaveBeenCalled();
            expect(JSON.stringify(onDrift.mock.calls)).not.toContain(TOKEN);
        });

        it('does not fail the request when drift is detected', async () => {
            const page = await makeClient(jsonFetch({ success: true, count: 0 }), {
                onDrift: jest.fn(),
            }).findDatapacks({});
            expect(page.items).toEqual([]);
        });
    });
    /**
     * Every read endpoint, asserted on what it SENDS.
     *
     * These were reached by nothing before: eight methods whose whole body could be
     * deleted with the suite green. The assertions are on the request the client
     * built — the query keys are a wire contract with the deployed service, and a
     * mocked fetch cannot notice a malformed one on its own.
     */
    describe('every endpoint, and the query it builds', () => {
        it('asks get-datapack-metadata for one name and version', async () => {
            const f = jsonFetch(load('get-datapack-metadata.json'));

            const detail = await makeClient(f).getDatapackDetail({
                name: 'citisignal_new',
                version: 'main',
            });

            const { url } = callArgs(f);
            expect(url).toContain('/get-datapack-metadata');
            expect(url).toContain('datapack_name=citisignal_new');
            expect(url).toContain('version=main');
            expect(detail.id.name).toBe('citisignal_new');
            expect(detail.displayName).toBe('CitiSignal (Updated Data)');
        });

        it('asks get-data-item for a datapack, a type and a version', async () => {
            const f = jsonFetch(load('get-data-item.json'));

            const item = await makeClient(f).getDataItem(
                { name: 'citisignal_new', version: 'main' },
                'categories',
            );

            const { url } = callArgs(f);
            expect(url).toContain('datapack_name=citisignal_new');
            expect(url).toContain('data_type=categories');
            expect(url).toContain('version=main');
            expect(item.dataType).toBe('categories');
        });

        it('returns the export data-type catalog', async () => {
            const f = jsonFetch(load('get-export-data-types.json'));

            const types = await makeClient(f).getExportDataTypes();

            expect(callArgs(f).url).toContain('/get-export-data-types');
            expect(types.map((t) => t.dataType)).toContain('product_attributes');
        });

        it('asks for the processor order of ONE mode and keeps the order', async () => {
            // Import and export return different lists, so the mode has to reach
            // the wire — an emptied query silently answers the wrong question.
            const f = jsonFetch(load('processor-order-export.json'));

            const order = await makeClient(f).getProcessorOrder('export');

            expect(callArgs(f).url).toContain('operation_mode=export');
            expect(order[0]).toBe('product_attributes');
            expect(order).toContain('attribute_sets');
        });

        it('filters installed datapacks by instance, identity and paging', async () => {
            const f = jsonFetch(load('get-installed-datapacks.json'));

            const page = await makeClient(f).getInstalledDatapacks({
                commerceInstance: 'instance-04',
                datapackName: 'AFREEN-LG-DEMO',
                version: 'dev',
                limit: 10,
                skip: 5,
            });

            const { url } = callArgs(f);
            expect(url).toContain('/get-installed-datapacks');
            expect(url).toContain('commerce_instance=instance-04');
            expect(url).toContain('datapack_name=AFREEN-LG-DEMO');
            expect(url).toContain('version=dev');
            expect(url).toContain('limit=10');
            expect(url).toContain('skip=5');
            expect(page.items[0].commerceInstance).toBe('instance-04');
        });

        it('filters the activity log on every field the query carries', async () => {
            const f = jsonFetch(load('logs.json'));

            const page = await makeClient(f).getActivityLog({
                datapackName: 'citisignal_new',
                version: 'main',
                operationMode: 'import',
                commerceInstance: 'instance-04',
                siteType: 'eds',
                startDate: '2026-08-01',
                endDate: '2026-08-31',
                limit: 10,
                skip: 3,
            });

            const { url } = callArgs(f);
            for (const param of [
                'datapack_name=citisignal_new',
                'version=main',
                'operation_mode=import',
                'commerce_instance=instance-04',
                'site_type=eds',
                'start_date=2026-08-01',
                'end_date=2026-08-31',
                'limit=10',
                'skip=3',
            ]) {
                expect(url).toContain(param);
            }
            expect(page.items[0].activationId).toBe('activation-02');
        });
    });

    /**
     * The activation echo — the only source that says why an accepted job did
     * nothing. A 400 from it IS the answer; anything else is still a failure.
     */
    describe('the activation echo', () => {
        it('reads the validation error out of a 400 body', async () => {
            const f = jsonFetch(load('async-process-status-invalidinput.json'), 400, 'Bad Request');

            const reason = await makeClient(f).getJobFailureReason('activation-09');

            expect(callArgs(f).url).toContain('/async-process-status/activation-09');
            expect(reason?.error).toContain('Invalid input');
        });

        it('explains nothing for the stale in_progress echo', async () => {
            // This endpoint reports in_progress for jobs that finished hours ago,
            // so that body is not evidence of anything.
            const f = jsonFetch(load('async-process-status-aged.json'));

            expect(await makeClient(f).getJobFailureReason('activation-01')).toBeUndefined();
        });

        it('rethrows any status other than 400', async () => {
            const f = jsonFetch({ error: 'boom' }, 500, 'Internal Server Error');

            const err = await makeClient(f)
                .getJobFailureReason('a')
                .catch((e: unknown) => e);

            expect(err).toBeInstanceOf(DataInstallerApiError);
            expect((err as DataInstallerApiError).status).toBe(500);
        });
    });

    describe('what the request carries, and what it must not', () => {
        it('sends neither Content-Type nor a body key on a GET', async () => {
            const f = jsonFetch(load('find-datapacks.json'));

            await makeClient(f).findDatapacks({});

            const { init } = callArgs(f);
            expect(headerOf(init, 'Content-Type')).toBeUndefined();
            // `body: undefined` and no `body` key are different things to fetch,
            // and only the second is what a GET may carry — so the assertion is
            // on the KEY, not on the value being undefined.
            expect(Object.keys(init)).not.toContain('body');
        });

        it('defaults include_content to false, so a listing pulls no payloads', async () => {
            const f = jsonFetch(load('batch-ok.json'));

            await makeClient(f).batchGetDataItems({ name: 'x', version: 'main' }, ['categories']);

            expect(JSON.parse(String(callArgs(f).init.body)).include_content).toBe(false);
        });

        it('sends include_content true when the caller asks for payloads', async () => {
            const f = jsonFetch(load('batch-ok.json'));

            await makeClient(f).batchGetDataItems(
                { name: 'x', version: 'main' },
                ['categories'],
                true,
            );

            expect(JSON.parse(String(callArgs(f).init.body)).include_content).toBe(true);
        });

        it('reports the timeout in SECONDS, not milliseconds', async () => {
            const abort = new Error('aborted');
            abort.name = 'AbortError';
            const f = jest.fn().mockRejectedValue(abort);
            const client = new DataInstallerClient({
                baseUrl: BASE,
                getToken: async () => TOKEN,
                fetchImpl: f as unknown as typeof fetch,
                timeoutMs: 5000,
            });

            await expect(client.findDatapacks({})).rejects.toThrow(/timed out after 5s/);
        });

        it('does not call an unclassifiable transport failure unreachable', async () => {
            // Only a TypeError('fetch failed') means unreachable. Anything else
            // keeps its own message, or a network hiccup gets blamed on the URL
            // setting and the user edits something that was never wrong.
            const f = jest.fn().mockRejectedValue(new Error('socket hang up'));

            const err = (await makeClient(f)
                .findDatapacks({})
                .catch((e: unknown) => e)) as Error;

            expect(err.message).toContain('socket hang up');
            expect(err.message).not.toContain('could not reach');
        });
    });

    describe('the drift canary, per endpoint', () => {
        /** Each endpoint that declares expected keys, and the call that reaches it. */
        const DRIFT_CASES: ReadonlyArray<{
            action: string;
            keys: string[];
            call: (client: DataInstallerClient) => Promise<unknown>;
        }> = [
            { action: 'find-datapacks', keys: ['datapacks'], call: (c) => c.findDatapacks({}) },
            {
                action: 'get-datapack-metadata',
                keys: ['datapack_name', 'display_name'],
                call: (c) => c.getDatapackDetail({ name: 'x', version: 'main' }),
            },
            {
                action: 'get-data-item',
                keys: ['data'],
                call: (c) => c.getDataItem({ name: 'x', version: 'main' }, 'categories'),
            },
            {
                action: 'batch-get-data-items',
                keys: ['results'],
                call: (c) => c.batchGetDataItems({ name: 'x', version: 'main' }, ['categories']),
            },
            {
                action: 'get-export-data-types',
                keys: ['data_types'],
                call: (c) => c.getExportDataTypes(),
            },
            {
                action: 'get-processor-order',
                keys: ['processors'],
                call: (c) => c.getProcessorOrder('import'),
            },
            {
                action: 'get-installed-datapacks',
                keys: ['datapacks'],
                call: (c) => c.getInstalledDatapacks({}),
            },
            { action: 'logs', keys: ['logs'], call: (c) => c.getActivityLog({}) },
        ];

        it.each(DRIFT_CASES)(
            'names exactly the missing keys for $action',
            async ({ action, keys, call }) => {
                const onDrift = jest.fn();

                await call(makeClient(jsonFetch({ success: true }), { onDrift }));

                expect(onDrift).toHaveBeenCalledWith(action, keys);
            },
        );

        it('checks no shape for an endpoint it holds no expectation for', async () => {
            // datapack-process-status declares no expected keys. The guard is what
            // stops the check reading `.filter` off undefined and failing a call
            // that was perfectly fine.
            const onDrift = jest.fn();

            const snap = await makeClient(jsonFetch({ success: true }), { onDrift }).getJobStatus(
                'a',
            );

            expect(onDrift).not.toHaveBeenCalled();
            expect(snap.activationId).toBe('a');
        });

        it('reports drift when the body is JSON null rather than crashing', async () => {
            const onDrift = jest.fn();

            const page = await makeClient(jsonFetch(null), { onDrift }).findDatapacks({});

            expect(onDrift).toHaveBeenCalledWith('find-datapacks', ['datapacks']);
            expect(page.items).toEqual([]);
        });

        it('reports drift when a 200 body is not JSON at all', async () => {
            // A maintenance page served with a 200 parses to its own text. That is
            // drift — the keys are gone — and not a parse crash.
            const onDrift = jest.fn();

            const page = await makeClient(okTextFetch('<html>maintenance</html>'), {
                onDrift,
            }).findDatapacks({});

            expect(onDrift).toHaveBeenCalledWith('find-datapacks', ['datapacks']);
            expect(page.items).toEqual([]);
        });
    });
});
