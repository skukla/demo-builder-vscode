/**
 * The export half of the write client — Stage 3.
 *
 * Every contract below was measured against the live service on 2026-08-14, and
 * several contradict the vendor docs. The expensive ones:
 *
 * **`verbose` is mandatory on export.** Without it the service answers a bare
 * `success: false` with an all-zero `entity_summary` and NO reason — which cost
 * a full day of guessing. With `verbose: 'full'` the same call returns the real
 * per-endpoint error. This client never sends an export without it.
 *
 * **Two instance forms, deliberately.** `process-datapack` accepts the ACCS
 * tenant id (its pre-flight passes and our imports have always used it), but
 * `get-export-items` refuses it — "commerce_instance must be a full URL … or set
 * COMMERCE_INSTANCE_URL_TEMPLATE", which is a deployment config that action does
 * not have. So the list call takes the REST base URL and the export call takes
 * the instance, and this client sends each what it accepts rather than pretending
 * they agree.
 *
 * **`x-client-scope` on the list call.** Undocumented in the source drop, listed
 * as optional in the wiki, and required in practice for ACCS.
 *
 * **NEVER `MONGO_URI`.** The service's own store-failure message invites callers
 * to pass it "in params". It is the service's secret, we do not hold it, and a
 * database URI has no business in a request body.
 *
 * Strict TDD: written BEFORE the methods exist.
 */

import { DataInstallerWriteClient } from '@/features/data-installer/services/dataInstallerWriteClient';

const BASE = 'https://example.test/api/v1/web/data-installer-api';

const ACCS_EXPORT = {
    id: { name: 'captured-pack', version: 'v1' },
    commerceInstance: 'UoGYsHrcxMyeoVd2zUktZi',
    restBaseUrl: 'https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi',
    dataTypes: ['attribute_sets'],
    credentials: {
        kind: 'accs' as const,
        clientId: 'cid-1',
        clientSecret: 'fake-test-secret-not-a-secret',
    },
};

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

function bodyOf(fetchImpl: jest.Mock, call = 0): Record<string, unknown> {
    return JSON.parse(fetchImpl.mock.calls[call][1].body);
}

describe('listExportItems', () => {
    const PAGE = {
        success: true,
        data_type: 'attribute_sets',
        pagination: { page: 1, page_size: 50, total_count: 8, total_pages: 1 },
        excluded_count: 1,
        items: [{ id: 10, display_name: 'Accessories', metadata: {} }],
    };

    it('GETs with data_type as a QUERY parameter, not a path segment', async () => {
        const fetchImpl = ok(PAGE);

        await makeClient(fetchImpl).listExportItems(ACCS_EXPORT, 'attribute_sets');

        const [url, init] = fetchImpl.mock.calls[0];
        // Runtime routes on the last path segment: `/get-export-items/attribute_sets`
        // routes nowhere and the action never sees a data_type.
        expect(String(url)).toContain(`${BASE}/get-export-items?`);
        expect(String(url)).toContain('data_type=attribute_sets');
        expect(init.method ?? 'GET').toBe('GET');
    });

    it('sends the REST BASE URL as the instance, not the tenant id', async () => {
        const fetchImpl = ok(PAGE);

        await makeClient(fetchImpl).listExportItems(ACCS_EXPORT, 'attribute_sets');

        const { headers } = fetchImpl.mock.calls[0][1];
        expect(headers['x-commerce-instance']).toBe(ACCS_EXPORT.restBaseUrl);
    });

    it('sends the credential pair AND the scope ACCS needs', async () => {
        const fetchImpl = ok(PAGE);

        await makeClient(fetchImpl).listExportItems(ACCS_EXPORT, 'attribute_sets');

        const { headers } = fetchImpl.mock.calls[0][1];
        expect(headers['x-client-id']).toBe('cid-1');
        expect(headers['x-client-secret']).toBe('fake-test-secret-not-a-secret');
        expect(headers['x-client-scope']).toContain('commerce.accs');
    });

    it('returns the items, the total and what the service excluded', async () => {
        const fetchImpl = ok(PAGE);

        const page = await makeClient(fetchImpl).listExportItems(ACCS_EXPORT, 'attribute_sets');

        expect(page.items).toEqual([{ id: 10, displayName: 'Accessories' }]);
        expect(page.totalCount).toBe(8);
        // Surfaced on purpose: "8 of 9, one excluded" is the difference between a
        // filter working and a pack silently missing something.
        expect(page.excludedCount).toBe(1);
    });

    it('uses the admin pair for PaaS instead of the client headers', async () => {
        const fetchImpl = ok(PAGE);

        await makeClient(fetchImpl).listExportItems(
            {
                ...ACCS_EXPORT,
                credentials: { kind: 'paas', username: 'admin', password: 'fake-test-pw-not-a-secret' },
            },
            'attribute_sets',
        );

        const { headers } = fetchImpl.mock.calls[0][1];
        expect(headers['x-admin-username']).toBe('admin');
        expect(headers['x-admin-password']).toBe('fake-test-pw-not-a-secret');
        expect(headers['x-client-id']).toBeUndefined();
    });
});

describe('startExport', () => {
    const RESULT = {
        success: true,
        results: [
            {
                data_type: 'attribute_sets',
                success: true,
                entity_counts: { fetched: 9, selected: 8, exported: 8, stored: 8, excluded: 1 },
            },
        ],
    };

    it('sends operation_mode export with the identity and types', async () => {
        const fetchImpl = ok(RESULT);

        await makeClient(fetchImpl).startExport(ACCS_EXPORT);

        expect(String(fetchImpl.mock.calls[0][0])).toBe(`${BASE}/process-datapack`);
        expect(bodyOf(fetchImpl)).toMatchObject({
            datapack_name: 'captured-pack',
            version: 'v1',
            operation_mode: 'export',
            data_types: ['attribute_sets'],
            commerce_instance: 'UoGYsHrcxMyeoVd2zUktZi',
        });
    });

    /** The day-costing lesson, pinned. */
    it('ALWAYS asks for verbose output', async () => {
        const fetchImpl = ok(RESULT);

        await makeClient(fetchImpl).startExport(ACCS_EXPORT);

        expect(bodyOf(fetchImpl).verbose).toBe('full');
    });

    it('never sends a MONGO_URI, whatever the service asks for', async () => {
        const fetchImpl = ok(RESULT);

        await makeClient(fetchImpl).startExport(ACCS_EXPORT);

        expect(JSON.stringify(bodyOf(fetchImpl))).not.toContain('MONGO_URI');
        expect(JSON.stringify(bodyOf(fetchImpl))).not.toContain('mongodb');
    });

    it('passes selections through when the user picked items', async () => {
        const fetchImpl = ok(RESULT);

        await makeClient(fetchImpl).startExport({
            ...ACCS_EXPORT,
            selections: { attribute_sets: { attribute_set_id: [10, 11] } },
        });

        expect(bodyOf(fetchImpl).selections).toEqual({
            attribute_sets: { filters: { attribute_set_id: { operator: 'in', value: [10, 11] } } },
        });
    });

    it('omits selections entirely when nothing was picked', async () => {
        const fetchImpl = ok(RESULT);

        await makeClient(fetchImpl).startExport(ACCS_EXPORT);

        expect(bodyOf(fetchImpl)).not.toHaveProperty('selections');
    });

    it('reports per-type counts from the export response shape', async () => {
        const fetchImpl = ok(RESULT);

        const outcome = await makeClient(fetchImpl).startExport(ACCS_EXPORT);

        expect(outcome.success).toBe(true);
        expect(outcome.perType).toEqual([
            { dataType: 'attribute_sets', success: true, exported: 8, excluded: 1 },
        ]);
    });

    /**
     * The failure this feature was built through: the store step 500s because the
     * service's export path has no MongoDB URI. `verbose` is what surfaces it, and
     * the reason must reach the user rather than becoming another silent zero.
     */
    it('surfaces the per-endpoint reason a failed export hides by default', async () => {
        const fetchImpl = ok({
            success: false,
            results: [
                {
                    data_type: 'attribute_sets',
                    success: false,
                    entity_summary: { exported: 0 },
                    responses: {
                        attribute_sets_export: {
                            success: false,
                            statusCode: 500,
                            error: 'Failed to store exported data: MongoDB connection URI required.',
                        },
                    },
                },
            ],
        });

        const outcome = await makeClient(fetchImpl).startExport(ACCS_EXPORT);

        expect(outcome.success).toBe(false);
        expect(outcome.perType[0].reason).toContain('MongoDB connection URI required');
    });
});
