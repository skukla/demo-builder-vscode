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
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import {
    createStatefulGlobalState,
    createMockExtensionContext,
} from '../../../helpers/extensionContextFake';
import { createMockWebviewPanel } from '../../../helpers/webviewPanelFake';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';

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

/** A PaaS project: no ACCS endpoint, so the REST root is the Commerce URL. */
function paasProject(url?: string): Partial<Project> {
    return {
        name: 'demo-paas',
        componentSelections: { backend: 'adobe-commerce-paas' },
        componentConfigs: {
            'adobe-commerce-paas': url === undefined ? {} : { ADOBE_COMMERCE_URL: url },
        },
    };
}

function makeImportHarness(project: unknown = accsProject()) {
    return createMockHandlerContext({
        logger: createMockLogger(),
        debugLogger: createMockLogger(),
        authManager: createMockAuthenticationService({
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getTokenManager: jest.fn().mockReturnValue({
                inspectToken: jest.fn().mockResolvedValue({ valid: true, token: 'tok' }),
            }),
        }),
        panel: createMockWebviewPanel(),
        context: createMockExtensionContext({
            globalState: createStatefulGlobalState().globalState,
            secrets: createMockSecretStorage().secrets,
        }),
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
        }),
        sendMessage: jest.fn(),
    });
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
                : true
        ),
    });
    mockedCredentials.mockResolvedValue({
        ok: true,
        credentials: {
            kind: 'accs',
            clientId: 'cid',
            clientSecret: 'fake-test-secret-not-a-secret',
        },
    });
    listExportItems = jest.fn().mockResolvedValue({ items: [], totalCount: 0, excludedCount: 0 });
    startExport = jest.fn().mockResolvedValue({ success: true, perType: [] });
    MockedClient.mockImplementation(
        () => ({ listExportItems, startExport }) as unknown as DataInstallerWriteClient
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
            'attribute_sets'
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
        const result = await importHandlers['list-datapack-export-items'](
            makeImportHarness(),
            PAYLOAD
        );

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
            })
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
        mockedCredentials.mockResolvedValue({ ok: false, reason: 'needs-accs-credentials' });

        const result = await importHandlers['start-datapack-export'](makeImportHarness(), PAYLOAD);

        expect(result.success).toBe(false);
        expect(startExport).not.toHaveBeenCalled();
    });

    it('never puts the credential pair in the response', async () => {
        const result = await importHandlers['start-datapack-export'](makeImportHarness(), PAYLOAD);

        expect(JSON.stringify(result)).not.toContain('fake-test-secret-not-a-secret');
    });
});

describe('prepareExport guards', () => {
    it('refuses a payload that is missing entirely', async () => {
        const list = await importHandlers['list-datapack-export-items'](
            makeImportHarness(),
            undefined
        );
        const start = await importHandlers['start-datapack-export'](makeImportHarness(), undefined);

        expect(list.success).toBe(false);
        expect(start.success).toBe(false);
        expect(listExportItems).not.toHaveBeenCalled();
        expect(startExport).not.toHaveBeenCalled();
    });

    // Both export handlers share prepareExport, so the LIST call must refuse a
    // half-named target too — not fall through to a request it cannot build.
    it('refuses a half-named target on the list call, with the naming reason', async () => {
        const result = await importHandlers['list-datapack-export-items'](makeImportHarness(), {
            ...PAYLOAD,
            datapackName: '',
            dataType: 'attribute_sets',
        });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/datapack name and a version/);
        expect(listExportItems).not.toHaveBeenCalled();
    });

    it('refuses without a Commerce instance to export from', async () => {
        const result = await importHandlers['start-datapack-export'](makeImportHarness(), {
            ...PAYLOAD,
            commerceInstance: '',
        });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Commerce instance is required/);
        expect(startExport).not.toHaveBeenCalled();
    });

    // An ABSENT dataTypes is the same refusal as an empty one: the default is
    // nothing, never everything, because the request writes to a shared catalog.
    it('refuses when dataTypes is absent, not just when it is empty', async () => {
        const { dataTypes: _dropped, ...withoutTypes } = PAYLOAD;
        const result = await importHandlers['start-datapack-export'](
            makeImportHarness(),
            withoutTypes
        );

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/at least one data type/);
        expect(startExport).not.toHaveBeenCalled();
    });

    it('returns the access refusal when the Data Installer is not configured', async () => {
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn(() => undefined),
        });

        const result = await importHandlers['start-datapack-export'](makeImportHarness(), PAYLOAD);

        expect(result.success).toBe(false);
        // The access refusal is returned AS IT CAME, code included: the UI
        // branches on INVALID_OPERATION to offer the settings fix, so it must
        // not be flattened into a generic failure on the way out.
        expect(result.code).toBe(ErrorCode.INVALID_OPERATION);
        expect(MockedClient).not.toHaveBeenCalled();
        expect(startExport).not.toHaveBeenCalled();
    });

    it('refuses when no project is open', async () => {
        const result = await importHandlers['start-datapack-export'](
            makeImportHarness(null),
            PAYLOAD
        );

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Open a project before exporting/);
        expect(startExport).not.toHaveBeenCalled();
    });

    it('builds the write client against the configured API base URL', async () => {
        await importHandlers['start-datapack-export'](makeImportHarness(), PAYLOAD);

        expect(MockedClient).toHaveBeenCalledWith(
            expect.objectContaining({
                baseUrl: 'https://example-namespace.adobeioruntime.net/api/v1/web/data-installer-api',
            })
        );
    });

    // Omitted means "everything allowed" — a selections key must only appear
    // when the caller chose one, and must carry what they chose.
    it('passes selections through only when the caller sent them', async () => {
        const selections = { attribute_sets: { attribute_set_id: [10, 11] } };

        await importHandlers['start-datapack-export'](makeImportHarness(), {
            ...PAYLOAD,
            selections,
        });
        expect(startExport).toHaveBeenCalledWith(expect.objectContaining({ selections }));

        startExport.mockClear();
        await importHandlers['start-datapack-export'](makeImportHarness(), PAYLOAD);
        expect(startExport.mock.calls[0][0]).not.toHaveProperty('selections');
    });
});

describe('credential refusals', () => {
    it('names the specific gap rather than a generic one', async () => {
        mockedCredentials.mockResolvedValue({ ok: false, reason: 'missing-paas-admin' });

        const result = await importHandlers['start-datapack-export'](makeImportHarness(), PAYLOAD);

        expect(result.error).toMatch(/no Commerce admin username and password saved/);
        expect(startExport).not.toHaveBeenCalled();
    });

    it('falls back to a generic message for a gap it has no wording for', async () => {
        mockedCredentials.mockResolvedValue({
            ok: false,
            reason: 'something-new' as 'missing-paas-admin',
        });

        const result = await importHandlers['start-datapack-export'](makeImportHarness(), PAYLOAD);

        expect(result.error).toBe('Commerce credentials are missing.');
    });

    /**
     * The provisioning offer is gated on the Adobe binding for the same reason
     * the import spine's is: an offer that leads nowhere is worse than none.
     */
    it('offers ACCS provisioning when the reason is ACCS and the project is bound', async () => {
        mockedCredentials.mockResolvedValue({ ok: false, reason: 'needs-accs-credentials' });

        const result = await importHandlers['start-datapack-export'](
            makeImportHarness({
                ...accsProject(),
                adobe: { organization: 'org', projectId: 'proj', workspace: 'stage' },
            }),
            PAYLOAD
        );

        expect(result.data).toEqual({ needsAccsCredentials: true });
    });

    it('withholds the offer when the project has no Adobe workspace to provision into', async () => {
        mockedCredentials.mockResolvedValue({ ok: false, reason: 'needs-accs-credentials' });

        const result = await importHandlers['start-datapack-export'](makeImportHarness(), PAYLOAD);

        expect(result.data).toEqual({ needsAccsCredentials: false });
    });

    it('withholds the offer for a non-ACCS gap even on a bound project', async () => {
        mockedCredentials.mockResolvedValue({ ok: false, reason: 'missing-paas-admin' });

        const result = await importHandlers['start-datapack-export'](
            makeImportHarness({
                ...accsProject(),
                adobe: { organization: 'org', projectId: 'proj', workspace: 'stage' },
            }),
            PAYLOAD
        );

        expect(result.data).toEqual({ needsAccsCredentials: false });
    });
});

describe('the REST base URL', () => {
    it('uses the Commerce URL as-is for a PaaS project', async () => {
        await importHandlers['start-datapack-export'](
            makeImportHarness(paasProject('https://paas.example.com')),
            PAYLOAD
        );

        expect(startExport).toHaveBeenCalledWith(
            expect.objectContaining({ restBaseUrl: 'https://paas.example.com' })
        );
    });

    it('sends an empty base URL when the project configures neither', async () => {
        await importHandlers['start-datapack-export'](makeImportHarness(paasProject()), PAYLOAD);

        expect(startExport).toHaveBeenCalledWith(expect.objectContaining({ restBaseUrl: '' }));
    });

    // Only a TRAILING /graphql is the suffix — one earlier in the path is part
    // of the tenant's own route and must survive.
    it('strips only the trailing /graphql, not an earlier one', async () => {
        await importHandlers['start-datapack-export'](
            makeImportHarness({
                ...accsProject(),
                componentConfigs: {
                    'adobe-commerce-accs': {
                        ACCS_GRAPHQL_ENDPOINT: 'https://na1.commerce.adobe.com/graphql-eu/t1/graphql',
                    },
                },
            }),
            PAYLOAD
        );

        expect(startExport).toHaveBeenCalledWith(
            expect.objectContaining({
                restBaseUrl: 'https://na1.commerce.adobe.com/graphql-eu/t1',
            })
        );
    });
});

describe('when the service call itself fails', () => {
    it('reports why the list could not be fetched', async () => {
        listExportItems.mockRejectedValue(new Error('502 from get-export-items'));

        const result = await importHandlers['list-datapack-export-items'](makeImportHarness(), {
            ...PAYLOAD,
            dataType: 'attribute_sets',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('502 from get-export-items');
    });

    it('falls back to a readable reason when the list throws a non-Error', async () => {
        listExportItems.mockRejectedValue('socket hang up');

        const result = await importHandlers['list-datapack-export-items'](makeImportHarness(), {
            ...PAYLOAD,
            dataType: 'attribute_sets',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Could not list what is available.');
    });

    it('reports why the export could not be started', async () => {
        startExport.mockRejectedValue(new Error('process-datapack refused the tenant id'));

        const result = await importHandlers['start-datapack-export'](makeImportHarness(), PAYLOAD);

        expect(result.success).toBe(false);
        expect(result.error).toBe('process-datapack refused the tenant id');
    });

    it('falls back to a readable reason when the export throws a non-Error', async () => {
        startExport.mockRejectedValue({ statusCode: 500 });

        const result = await importHandlers['start-datapack-export'](makeImportHarness(), PAYLOAD);

        expect(result.success).toBe(false);
        expect(result.error).toBe('The export could not be started.');
    });
});
