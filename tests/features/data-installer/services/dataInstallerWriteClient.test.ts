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

function makeClient(fetchImpl: jest.Mock) {
    return new DataInstallerWriteClient({
        baseUrl: BASE,
        getToken: async () => 'ims-token',
        fetchImpl: fetchImpl as unknown as typeof fetch,
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
            expect(body).toMatchObject({
                commerce_username: 'admin',
                commerce_password: 'fake-test-pw-not-a-secret',
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
            expect(body.commerce_username).toBeUndefined();
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
