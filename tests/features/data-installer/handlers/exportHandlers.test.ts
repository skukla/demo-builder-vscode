/**
 * The export handlers — Stage 3's extension-side spine.
 *
 * Two message types, matching the service's documented two-step flow:
 * `list-datapack-export-items` (what is here to capture) and
 * `start-datapack-export` (capture it).
 *
 * The guards are the point. An export WRITES a datapack into a catalog that
 * other teams share — 23 curated entries live in it — so it refuses before it
 * reaches the service when the target is not fully named. And it resolves the
 * REST base URL the list call needs from the project's own ACCS endpoint, which
 * is the one place that URL exists.
 *
 * Strict TDD: written BEFORE the handlers exist.
 */

import * as vscode from 'vscode';
import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import { resolveCommerceCredentials } from '@/features/data-installer/services/commerceCredentials';
import { DataInstallerWriteClient } from '@/features/data-installer/services/dataInstallerWriteClient';
import type { HandlerContext } from '@/types/handlers';
import type { Project } from '@/types/base';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../helpers/loggerFake';

jest.mock('@/features/data-installer/services/commerceCredentials', () => ({
    resolveCommerceCredentials: jest.fn(),
}));
jest.mock('@/features/data-installer/services/dataInstallerWriteClient');
jest.mock('@/features/data-installer/services/importJobRunner', () => ({
    watchImportJob: jest.fn(),
    IMPORT_POLL: { maxAttempts: 120, timeout: 600_000 },
}));

const mockedCredentials = resolveCommerceCredentials as jest.MockedFunction<
    typeof resolveCommerceCredentials
>;
const MockedClient = DataInstallerWriteClient as jest.MockedClass<typeof DataInstallerWriteClient>;

const ACCS_ENDPOINT = 'https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/graphql';

function accsProject(): Partial<Project> {
    return {
        name: 'demo-accs',
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentConfigs: { 'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: ACCS_ENDPOINT } },
    };
}

function makeImportHarness(project: unknown = accsProject()) {
    return {
        logger: createMockLogger(),
        debugLogger: createMockLogger(),
        authManager: {
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getTokenManager: jest.fn().mockReturnValue({
                inspectToken: jest.fn().mockResolvedValue({ valid: true, token: 'tok' }),
            }),
        },
        panel: {},
        context: { globalState: { get: jest.fn(), update: jest.fn() }, secrets: {} },
        stateManager: createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(project) }),
        sendMessage: jest.fn(),
    } as unknown as HandlerContext;
}

const PAYLOAD = {
    datapackName: 'captured-pack',
    version: 'v1',
    commerceInstance: 'UoGYsHrcxMyeoVd2zUktZi',
    dataTypes: ['attribute_sets'],
};

let listExportItems: jest.Mock;
let startExport: jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    // The access guard runs first and reads settings; without a base URL every
    // handler refuses before it reaches the client.
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn((key: string) =>
            key === 'apiBaseUrl'
                ? 'https://example-namespace.adobeioruntime.net/api/v1/web/data-installer-api'
                : true,
        ),
    });
    mockedCredentials.mockResolvedValue({
        ok: true,
        credentials: { kind: 'accs', clientId: 'cid', clientSecret: 'fake-test-secret-not-a-secret' },
    } as never);
    listExportItems = jest.fn().mockResolvedValue({ items: [], totalCount: 0, excludedCount: 0 });
    startExport = jest.fn().mockResolvedValue({ success: true, perType: [] });
    MockedClient.mockImplementation(
        () => ({ listExportItems, startExport }) as unknown as DataInstallerWriteClient,
    );
});

describe('list-datapack-export-items', () => {
    it('derives the REST base URL from the project ACCS endpoint', async () => {
        await importHandlers['list-datapack-export-items'](makeImportHarness(), {
            ...PAYLOAD,
            dataType: 'attribute_sets',
        });

        // The graphql suffix is stripped: get-export-items wants the REST root.
        expect(listExportItems).toHaveBeenCalledWith(
            expect.objectContaining({
                restBaseUrl: 'https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi',
            }),
            'attribute_sets',
        );
    });

    it('returns the page for the UI to choose from', async () => {
        listExportItems.mockResolvedValue({
            items: [{ id: 10, displayName: 'Accessories' }],
            totalCount: 8,
            excludedCount: 1,
        });

        const result = await importHandlers['list-datapack-export-items'](makeImportHarness(), {
            ...PAYLOAD,
            dataType: 'attribute_sets',
        });

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({ totalCount: 8, excludedCount: 1 });
    });

    it('refuses without a data type rather than asking for everything', async () => {
        const result = await importHandlers['list-datapack-export-items'](makeImportHarness(), PAYLOAD);

        expect(result.success).toBe(false);
        expect(listExportItems).not.toHaveBeenCalled();
    });
});

describe('start-datapack-export', () => {
    /**
     * The catalog is shared infrastructure. A pack written under a name someone
     * else owns is not something the service will stop, so this does.
     */
    it('refuses a nameless target instead of writing into the shared catalog', async () => {
        const result = await importHandlers['start-datapack-export'](makeImportHarness(), {
            ...PAYLOAD,
            datapackName: '',
        });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/name/i);
        expect(startExport).not.toHaveBeenCalled();
    });

    it('refuses without a version — name and version are the identity', async () => {
        const result = await importHandlers['start-datapack-export'](makeImportHarness(), {
            ...PAYLOAD,
            version: '',
        });

        expect(result.success).toBe(false);
        expect(startExport).not.toHaveBeenCalled();
    });

    it('refuses with no data types selected', async () => {
        const result = await importHandlers['start-datapack-export'](makeImportHarness(), {
            ...PAYLOAD,
            dataTypes: [],
        });

        expect(result.success).toBe(false);
        expect(startExport).not.toHaveBeenCalled();
    });

    it('passes the identity, instance and types through', async () => {
        await importHandlers['start-datapack-export'](makeImportHarness(), PAYLOAD);

        expect(startExport).toHaveBeenCalledWith(
            expect.objectContaining({
                id: { name: 'captured-pack', version: 'v1' },
                commerceInstance: 'UoGYsHrcxMyeoVd2zUktZi',
                dataTypes: ['attribute_sets'],
            }),
        );
    });

    /** The reason only `verbose` reveals must reach the user, not be swallowed. */
    it('returns the per-type reason when the service refuses to store', async () => {
        startExport.mockResolvedValue({
            success: false,
            perType: [
                {
                    dataType: 'attribute_sets',
                    success: false,
                    exported: 0,
                    excluded: 0,
                    reason: 'Failed to store exported data: MongoDB connection URI required.',
                },
            ],
        });

        const result = await importHandlers['start-datapack-export'](makeImportHarness(), PAYLOAD);

        expect(result.success).toBe(true); // the call worked; the export did not
        expect(JSON.stringify(result.data)).toContain('MongoDB connection URI required');
    });

    it('refuses when the project has no usable Commerce credentials', async () => {
        mockedCredentials.mockResolvedValue({ ok: false, reason: 'needs-accs-credentials' } as never);

        const result = await importHandlers['start-datapack-export'](makeImportHarness(), PAYLOAD);

        expect(result.success).toBe(false);
        expect(startExport).not.toHaveBeenCalled();
    });

    it('never puts the credential pair in the response', async () => {
        const result = await importHandlers['start-datapack-export'](makeImportHarness(), PAYLOAD);

        expect(JSON.stringify(result)).not.toContain('fake-test-secret-not-a-secret');
    });
});
