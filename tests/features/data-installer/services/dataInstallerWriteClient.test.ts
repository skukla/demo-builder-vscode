/**
 * Write client tests — the credentialed sibling of the read client.
 *
 * Two methods, because writes are two-step by contract:
 *
 *   `validateImport` → the SYNCHRONOUS `process-datapack` with
 *     `operation_mode: 'validate'`. This exists because **a 202 does not mean the
 *     request was valid**: the async entry point accepted an empty body with a
 *     202 and an activation id, while the sync twin 400s the same request.
 *     Validation happens in the worker, so it must be asked for up front.
 *
 *   `startImport` → `process-datapack-async`, returning the activation id the job
 *     runner polls.
 *
 * The 202 shape comes from the spike, not from invention:
 * `{success, status:"pending", activation_id, pipeline}` observed on the ACO twin.
 * `pipeline` varies by family so nothing reads it; only `activation_id` matters,
 * and a response without one is a failure rather than a silent success.
 *
 * NOT here: the status endpoints. Polling is a READ and already lives on the read
 * client — which is the point of splitting them. "Do we have credentials yet?" is
 * a type question, and watching a job does not need them.
 *
 * Strict TDD: written BEFORE the client exists.
 */

import { DataInstallerWriteClient } from '@/features/data-installer/services/dataInstallerWriteClient';
import { DataInstallerApiError, DataInstallerInputError } from '@/features/data-installer/services/dataInstallerErrors';

const BASE = 'https://example-namespace.adobeioruntime.net/api/v1/web/data-installer-api';

function ok(body: unknown, status = 200) {
    return jest.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(body),
    });
}

const logLines: string[] = [];

function makeClient(fetchImpl: jest.Mock) {
    return new DataInstallerWriteClient({
        baseUrl: BASE,
        getToken: async () => 'ims-token',
        fetchImpl: fetchImpl as unknown as typeof fetch,
        log: (line: string) => logLines.push(line),
    });
}

/** The smallest well-formed request. */
const REQUEST = {
    id: { name: 'bodea', version: 'main' },
    commerceInstance: 'whatever-the-user-typed',
    dataTypes: ['categories', 'products'],
    credentials: { kind: 'paas' as const, username: 'admin', password: 'fake-test-pw-not-a-secret' },
};

describe('DataInstallerWriteClient', () => {
    beforeEach(() => {
        logLines.length = 0;
    });

    /**
     * Every call logs its action and outcome — because the first live dry run
     * produced a refusal and an EMPTY Debug Logs channel. A user staring at a
     * service refusal with no record of what was sent or what came back cannot
     * debug anything, and neither could we.
     *
     * The line carries the ACTION and the STATUS/reason. Never the credentials,
     * never the request body — a body carries a secret pair by construction.
     */
    describe('logging', () => {
        it('logs the action and status of a refused call', async () => {
            const fetchImpl = jest.fn().mockResolvedValue(
                new Response(JSON.stringify({ success: false, error: 'Pre-flight check failed' }), {
                    status: 400,
                }),
            );

            await makeClient(fetchImpl).checkCredentials(REQUEST);

            const line = logLines.find((l) => l.includes('get-websites-and-stores'));
            expect(line).toBeDefined();
            expect(line).toContain('400');
        });

        it('logs a successful validate with its status', async () => {
            const fetchImpl = ok({ success: true });

            await makeClient(fetchImpl).validateImport(REQUEST);

            const line = logLines.find((l) => l.includes('process-datapack'));
            expect(line).toBeDefined();
            expect(line).toContain('200');
        });

        it('never logs a credential value', async () => {
            const fetchImpl = ok({ success: true });

            await makeClient(fetchImpl).validateImport(REQUEST);
            await makeClient(fetchImpl).checkCredentials(REQUEST);

            const joined = logLines.join('\n');
            expect(joined).not.toContain(REQUEST.credentials.kind === 'paas' ? REQUEST.credentials.password : '');
            expect(joined).not.toMatch(/password|client_secret/);
        });

        it('stays silent when no logger is supplied', async () => {
            const fetchImpl = ok({ activation_id: 'x' }, 202);
            const client = new DataInstallerWriteClient({
                baseUrl: BASE,
                getToken: async () => 'tok',
                fetchImpl: fetchImpl as unknown as typeof fetch,
            });

            await expect(client.startImport(REQUEST)).resolves.toBeDefined();
        });
    });

    describe('startImport', () => {
        it('returns the activation id from a 202', async () => {
            const fetchImpl = ok(
                { success: true, status: 'pending', activation_id: 'a'.repeat(32), pipeline: 'commerce' },
                202,
            );

            const result = await makeClient(fetchImpl).startImport(REQUEST);

            expect(result.activationId).toBe('a'.repeat(32));
        });

        it('posts to the async action, which must be the LAST path segment', async () => {
            const fetchImpl = ok({ activation_id: 'x' }, 202);

            await makeClient(fetchImpl).startImport(REQUEST);

            const [url, init] = fetchImpl.mock.calls[0];
            // Runtime routes on the last segment; a wrong one is a bare 404.
            expect(String(url)).toBe(`${BASE}/process-datapack-async`);
            expect(init.method).toBe('POST');
        });

        it('sends the identity, the instance and the requested types', async () => {
            const fetchImpl = ok({ activation_id: 'x' }, 202);

            await makeClient(fetchImpl).startImport(REQUEST);

            const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
            expect(body).toMatchObject({
                datapack_name: 'bodea',
                version: 'main',
                commerce_instance: 'whatever-the-user-typed',
                data_types: ['categories', 'products'],
                operation_mode: 'import',
            });
        });

        /**
         * Targeting, per the service author (Jeff, 2026-08-14): "you can specify
         * site and store on the data pack import. It will validate to make sure
         * they exist." The pair drives `session_website_id`, which the service
         * substitutes into every pack `website_ids` — so this is what decides
         * where a pack lands.
         */
        it('sends website_code and store_code when the user picked a target', async () => {
            const fetchImpl = ok({ activation_id: 'x' }, 202);

            await makeClient(fetchImpl).startImport({
                ...REQUEST,
                target: { websiteCode: 'bodea', storeCode: 'bodea_store_view' },
            });

            const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
            expect(body).toMatchObject({
                website_code: 'bodea',
                store_code: 'bodea_store_view',
            });
        });

        /**
         * Omitted is not the same as empty. The service defaults to `base` when
         * the pair is absent, but sending `""` is a value — and one without the
         * other is a documented 400 ("Both website_code and store_code must be
         * provided together"). No target means neither key exists.
         */
        it('omits both keys entirely when no target was picked', async () => {
            const fetchImpl = ok({ activation_id: 'x' }, 202);

            await makeClient(fetchImpl).startImport(REQUEST);

            const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
            expect(body).not.toHaveProperty('website_code');
            expect(body).not.toHaveProperty('store_code');
        });

        it('carries the target onto a delete, so a reset matches its import', async () => {
            const fetchImpl = ok({ activation_id: 'x' }, 202);

            await makeClient(fetchImpl).startDelete({
                ...REQUEST,
                target: { websiteCode: 'bodea', storeCode: 'bodea_store_view' },
            });

            const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
            expect(body).toMatchObject({
                operation_mode: 'delete',
                website_code: 'bodea',
                store_code: 'bodea_store_view',
            });
        });

        // The instance is whatever the user typed. No derivation, no validation,
        // no formatting — a prefill from an unverified equality is what writes
        // sample data into someone else's live demo.
        it('passes the instance string through untouched', async () => {
            const fetchImpl = ok({ activation_id: 'x' }, 202);

            await makeClient(fetchImpl).startImport({
                ...REQUEST,
                commerceInstance: '  https://Not-An-Id.example/  ',
            });

            const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
            expect(body.commerce_instance).toBe('  https://Not-An-Id.example/  ');
        });

        it('refuses an empty data-type list before the network', async () => {
            const fetchImpl = ok({ activation_id: 'x' }, 202);

            await expect(
                makeClient(fetchImpl).startImport({ ...REQUEST, dataTypes: [] }),
            ).rejects.toBeInstanceOf(DataInstallerInputError);
            expect(fetchImpl).not.toHaveBeenCalled();
        });

        // A 202 with no activation id leaves the runner nothing to poll, so it is
        // a failure — not a job that silently never reports.
        it('fails when a 202 carries no activation id', async () => {
            const fetchImpl = ok({ success: true, status: 'pending' }, 202);

            await expect(makeClient(fetchImpl).startImport(REQUEST)).rejects.toBeInstanceOf(
                DataInstallerApiError,
            );
        });

        it('surfaces a rejected start as an API error', async () => {
            const fetchImpl = ok({ success: false, error: 'Invalid input.' }, 400);

            await expect(makeClient(fetchImpl).startImport(REQUEST)).rejects.toBeInstanceOf(
                DataInstallerApiError,
            );
        });
    });

    // The reset. Same endpoints, same async pattern, one field different — which
    // is why the runner needs no changes to watch it.
    describe('startDelete', () => {
        it('sends operation_mode delete to the same async action', async () => {
            const fetchImpl = ok({ activation_id: 'a'.repeat(32) }, 202);

            const result = await makeClient(fetchImpl).startDelete(REQUEST);

            const [url, init] = fetchImpl.mock.calls[0];
            expect(String(url)).toBe(`${BASE}/process-datapack-async`);
            expect(JSON.parse(init.body).operation_mode).toBe('delete');
            expect(result.activationId).toBe('a'.repeat(32));
        });

        it('carries the same identity, instance and types an import would', async () => {
            const fetchImpl = ok({ activation_id: 'x' }, 202);

            await makeClient(fetchImpl).startDelete(REQUEST);

            expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({
                datapack_name: 'bodea',
                version: 'main',
                commerce_instance: 'whatever-the-user-typed',
                data_types: ['categories', 'products'],
            });
        });

        it('refuses an empty type list before the network, as import does', async () => {
            const fetchImpl = ok({ activation_id: 'x' }, 202);

            await expect(
                makeClient(fetchImpl).startDelete({ ...REQUEST, dataTypes: [] }),
            ).rejects.toBeInstanceOf(DataInstallerInputError);
            expect(fetchImpl).not.toHaveBeenCalled();
        });

        it('fails when a 202 carries no activation id', async () => {
            const fetchImpl = ok({ success: true }, 202);

            await expect(makeClient(fetchImpl).startDelete(REQUEST)).rejects.toBeInstanceOf(
                DataInstallerApiError,
            );
        });
    });

    describe('validateImport', () => {
        it('uses the SYNCHRONOUS action with operation_mode validate', async () => {
            const fetchImpl = ok({ success: true });

            await makeClient(fetchImpl).validateImport(REQUEST);

            const [url, init] = fetchImpl.mock.calls[0];
            expect(String(url)).toBe(`${BASE}/process-datapack`);
            expect(JSON.parse(init.body).operation_mode).toBe('validate');
        });

        it('reports valid for a 200', async () => {
            const result = await makeClient(ok({ success: true })).validateImport(REQUEST);

            expect(result).toEqual({ valid: true });
        });

        // The whole reason this step exists: the sync twin rejects what async
        // accepts, and its message names the cause.
        it('reports the reason for a 400 rather than throwing', async () => {
            const fetchImpl = ok(
                {
                    success: false,
                    error: 'Invalid input. Must provide one of: (datapack_name), (datapack_name + data_types[]), (data_type + data), or (items[])',
                },
                400,
            );

            const result = await makeClient(fetchImpl).validateImport(REQUEST);

            expect(result.valid).toBe(false);
            expect(result.reason).toMatch(/Must provide one of/);
        });

        it('still throws for a server failure, which is not a validation verdict', async () => {
            const fetchImpl = ok({ error: 'boom' }, 500);

            await expect(makeClient(fetchImpl).validateImport(REQUEST)).rejects.toBeInstanceOf(
                DataInstallerApiError,
            );
        });
    });

    describe('checkCredentials', () => {
        // The spike's own note: get-websites-and-stores is the cheapest way to
        // validate a credential pair. It answers "do these work?" without going
        // near process-datapack, so it cannot start anything by accident.
        it('asks the store endpoint, not process-datapack', async () => {
            const fetchImpl = ok({ success: true, websites: [] });

            await makeClient(fetchImpl).checkCredentials(REQUEST);

            expect(String(fetchImpl.mock.calls[0][0])).toBe(`${BASE}/get-websites-and-stores`);
        });

        it('reports usable credentials', async () => {
            const result = await makeClient(ok({ success: true, websites: [] })).checkCredentials(REQUEST);

            expect(result).toEqual({ usable: true });
        });

        it('reports the service reason when the pair is refused', async () => {
            const fetchImpl = ok({ success: false, error: 'Authentication failed' }, 401);

            const result = await makeClient(fetchImpl).checkCredentials(REQUEST);

            expect(result.usable).toBe(false);
            expect(result.reason).toMatch(/Authentication failed/);
        });

        it('carries the instance and credentials, not the datapack', async () => {
            const fetchImpl = ok({ success: true });

            await makeClient(fetchImpl).checkCredentials(REQUEST);

            const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
            expect(body).toMatchObject({
                commerce_instance: 'whatever-the-user-typed',
                admin_username: 'admin',
            });
            // Nothing about a datapack — this checks access, not a request.
            expect(body.datapack_name).toBeUndefined();
            expect(body.operation_mode).toBeUndefined();
        });
    });

    describe('credentials', () => {
        it('sends the IMS bearer for the service itself', async () => {
            const fetchImpl = ok({ activation_id: 'x' }, 202);

            await makeClient(fetchImpl).startImport(REQUEST);

            expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer ims-token');
        });

        it('carries PaaS admin credentials in the body', async () => {
            const fetchImpl = ok({ activation_id: 'x' }, 202);

            await makeClient(fetchImpl).startImport(REQUEST);

            const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
            // The names the service's own docs use. An earlier version of this
            // client invented `commerce_username`/`commerce_password`, which had
            // no source at all — PaaS imports would have failed in the worker.
            expect(body).toMatchObject({
                admin_username: 'admin',
                admin_password: 'fake-test-pw-not-a-secret',
            });
            expect(body.client_id).toBeUndefined();
        });

        it('carries ACCS OAuth credentials in the body', async () => {
            const fetchImpl = ok({ activation_id: 'x' }, 202);

            await makeClient(fetchImpl).startImport({
                ...REQUEST,
                credentials: { kind: 'accs', clientId: 'cid', clientSecret: 'fake-test-pw-not-a-secret' },
            });

            const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
            expect(body).toMatchObject({ client_id: 'cid', client_secret: 'fake-test-pw-not-a-secret' });
            expect(body.admin_username).toBeUndefined();
        });

        // Credentials must never reach a log line. The client's own error text is
        // the one place they could leak by accident.
        it('names no credential value in the error it throws', async () => {
            const fetchImpl = ok({ success: false, error: 'nope' }, 400);

            await expect(
                makeClient(fetchImpl).startImport({
                    ...REQUEST,
                    credentials: { kind: 'accs', clientId: 'cid', clientSecret: 'super-secret-value' },
                }),
            ).rejects.toThrow(expect.not.stringMatching(/super-secret-value/) as unknown as string);
        });
    });
});
