/**
 * An import from the modal must leave a mark on the PROJECT.
 *
 * `project.datapack` was written only by the wizard's Sample Data step. A pack
 * imported from the Data Installer modal left the project unchanged — and
 * `confirmSampleDataRemoval` gates on exactly that field, so reset silently never
 * offered to remove data the user had just imported. Observed live 2026-08-16:
 * an import finished successfully, and the reset that followed asked nothing.
 *
 * Recorded when the service ACCEPTS, not when the job finishes. A partial import
 * still puts data on the instance, and a record written only on full success
 * would leave that data with nothing pointing at it. The opposite error costs one
 * removal that reports nothing to remove.
 */

import * as vscode from 'vscode';
import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import { DataInstallerWriteClient } from '@/features/data-installer/services/dataInstallerWriteClient';
import type { Project } from '@/types/base';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import {
    createStatefulGlobalState,
    createMockExtensionContext,
} from '../../../helpers/extensionContextFake';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';

jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: jest.fn().mockResolvedValue({ authenticated: true }),
}));
jest.mock('@/features/data-installer/services/dataInstallerWriteClient');
jest.mock('@/features/data-installer/services/importJobRunner', () => ({
    watchImportJob: jest.fn(),
    IMPORT_POLL: { maxAttempts: 120, timeout: 600_000 },
}));

const MockedWriteClient = DataInstallerWriteClient as jest.MockedClass<
    typeof DataInstallerWriteClient
>;

const BASE = 'https://example-namespace.adobeioruntime.net/api/v1/web/data-installer-api';

/** PaaS so credentials resolve from declared config, with no broker involved. */
const PAAS_PROJECT = (): Partial<Project> => ({
    name: 'demo-a',
    componentSelections: { backend: 'adobe-commerce-paas' },
    componentConfigs: {
        'adobe-commerce-paas': {
            ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
            ADOBE_COMMERCE_ADMIN_PASSWORD: 'fake-test-pw-not-a-secret',
        },
    },
});

function makeImportHarness(project: Partial<Project>, saveProject = jest.fn()) {
    const context = createMockHandlerContext({
        logger: createMockLogger(),
        debugLogger: createMockLogger(),
        authManager: createMockAuthenticationService({
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getTokenManager: jest
                .fn()
                .mockReturnValue({ inspectToken: jest.fn().mockResolvedValue({ token: 'tok' }) }),
        }),
        panel: {} as vscode.WebviewPanel,
        context: createMockExtensionContext({
            globalState: createStatefulGlobalState().globalState,
            secrets: createMockSecretStorage().secrets,
        }),
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
            saveProject,
        }),
        sendMessage: jest.fn().mockResolvedValue(undefined),
    });
    return { context, saveProject };
}

const PAYLOAD = {
    datapackName: 'bodea',
    version: 'main',
    commerceInstance: 'inst-1',
    dataTypes: ['categories'],
};

/** The class carries private state no literal can supply; the methods stand in. */
function stubWriteClient(methods: Partial<DataInstallerWriteClient>): void {
    MockedWriteClient.mockImplementation(() => methods as DataInstallerWriteClient);
}

function happyClient() {
    stubWriteClient({
        validateImport: jest.fn().mockResolvedValue({ valid: true }),
        startImport: jest.fn().mockResolvedValue({ activationId: 'act-1' }),
        startDelete: jest.fn().mockResolvedValue({ activationId: 'act-9' }),
        checkCredentials: jest.fn().mockResolvedValue({ usable: true }),
    });
}

/** A client whose validate REFUSES, so the job is never accepted. */
function refusingClient() {
    stubWriteClient({
        validateImport: jest.fn().mockResolvedValue({ valid: false, reason: 'nope' }),
        startImport: jest.fn(),
        startDelete: jest.fn(),
        checkCredentials: jest.fn().mockResolvedValue({ usable: true }),
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn((key: string) => (key === 'apiBaseUrl' ? BASE : true)),
    });
});

describe('an accepted import records the datapack on the project', () => {
    it('writes name and version, and saves', async () => {
        happyClient();
        const project = PAAS_PROJECT();
        const { context, saveProject } = makeImportHarness(project);

        await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(project.datapack).toEqual({ name: 'bodea', version: 'main' });
        expect(saveProject).toHaveBeenCalled();
    });

    /**
     * CONTROL. A refused request is never accepted, so nothing may be recorded —
     * otherwise the test above would pass against code that records
     * unconditionally, which would put a datapack on projects that imported
     * nothing.
     */
    it('CONTROL — records nothing when validate refuses the request', async () => {
        refusingClient();
        const project = PAAS_PROJECT();
        const { context, saveProject } = makeImportHarness(project);

        await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(project.datapack).toBeUndefined();
        expect(saveProject).not.toHaveBeenCalled();
    });

    /**
     * The service has already accepted the job by this point. Failing the handler
     * over a bookkeeping write would report a started import as a failed one.
     */
    it('still reports success when the project write fails', async () => {
        happyClient();
        const saveProject = jest.fn().mockRejectedValue(new Error('disk full'));
        const { context } = makeImportHarness(PAAS_PROJECT(), saveProject);

        const result = await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(result.success).toBe(true);
    });
});

describe('an accepted reset clears it', () => {
    it('removes the datapack so reset stops offering a removal already done', async () => {
        happyClient();
        const project = { ...PAAS_PROJECT(), datapack: { name: 'bodea', version: 'main' } };
        const { context, saveProject } = makeImportHarness(project);

        await importHandlers['reset-datapack'](context, { ...PAYLOAD, confirm: true });

        expect(project.datapack).toBeUndefined();
        expect(saveProject).toHaveBeenCalled();
    });

    // Confirm-gated: an unconfirmed reset does nothing at all, including to the
    // project record.
    it('CONTROL — an unconfirmed reset changes nothing', async () => {
        happyClient();
        const project = { ...PAAS_PROJECT(), datapack: { name: 'bodea', version: 'main' } };
        const { context, saveProject } = makeImportHarness(project);

        await importHandlers['reset-datapack'](context, PAYLOAD);

        expect(project.datapack).toEqual({ name: 'bodea', version: 'main' });
        expect(saveProject).not.toHaveBeenCalled();
    });
});
