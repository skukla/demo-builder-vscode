/**
 * An import from the modal must leave a mark on the PROJECT (`recordDatapackOnProject`
 * in `importJobWatch.ts`, driven through the merged handler map).
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

// The family helper owns the module wall AND re-exports the handler. It must be
// imported BEFORE anything it mocks, and the handler must come from it — a direct
// import of the SUT loads the real module before these mocks register.
import { happyEngine, importHandlers, mockedInstalledByDemoBuilder, mockedWatch, stubEngine } from './importHandlers.testUtils';
import * as vscode from 'vscode';
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


const BASE = 'https://example-namespace.adobeioruntime.net/api/v1/web/data-installer-api';

/** PaaS so credentials resolve from declared config, with no broker involved. */
const PAAS_PROJECT = (): Partial<Project> => ({
    name: 'demo-a',
    // Every project has one; a removal looks beside it for Demo Builder's install record (DI-5).
    path: '/nonexistent/projects/demo-a',
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

/** An engine whose validate REFUSES, so the job is never accepted. */
function refusingEngine() {
    stubEngine({
        validateImport: jest.fn().mockResolvedValue({ valid: false, reason: 'nope' }),
        startImport: jest.fn(),
        startDelete: jest.fn(),
        checkCredentials: jest.fn().mockResolvedValue({ usable: true }),
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockedInstalledByDemoBuilder.mockResolvedValue(true);
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn((key: string) => (key === 'apiBaseUrl' ? BASE : true)),
    });
});

describe('an accepted import records the datapack on the project', () => {
    it('writes name, version and the store it came from, and saves', async () => {
        happyEngine();
        const project = PAAS_PROJECT();
        const { context, saveProject } = makeImportHarness(project);

        await importHandlers['start-datapack-import'](context, PAYLOAD);

        // The store is recorded so a copy or an exported file installs from the same one.
        expect(project.datapack).toEqual({ name: 'bodea', version: 'main', store: 'installer' });
        expect(saveProject).toHaveBeenCalled();
    });

    /**
     * CONTROL. A refused request is never accepted, so nothing may be recorded —
     * otherwise the test above would pass against code that records
     * unconditionally, which would put a datapack on projects that imported
     * nothing.
     */
    it('CONTROL — records nothing when validate refuses the request', async () => {
        refusingEngine();
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
        happyEngine();
        const saveProject = jest.fn().mockRejectedValue(new Error('disk full'));
        const { context } = makeImportHarness(PAAS_PROJECT(), saveProject);

        const result = await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(result.success).toBe(true);
    });
});

describe('a reset that finishes clears it', () => {
    it('removes the datapack so reset stops offering a removal already done', async () => {
        happyEngine();
        mockedWatch.mockResolvedValue({ outcome: 'success', perType: {} });
        const project = { ...PAAS_PROJECT(), datapack: { name: 'bodea', version: 'main' } };
        const { context, saveProject } = makeImportHarness(project);

        await importHandlers['reset-datapack'](context, { ...PAYLOAD, confirm: true });
        // Cleared when the watch ends, not when the reset is accepted (live, 2026-10-30).
        await new Promise((resolve) => setImmediate(resolve));

        expect(project.datapack).toBeUndefined();
        expect(saveProject).toHaveBeenCalled();
    });

    // A project installs one pack, then another, and names the last. Removing the first must not
    // clear the second: project reset gates on this field, and would stop offering to remove it.
    it.each([
        ['another pack', { name: 'frescopa', version: 'main' }],
        ['another version of it', { name: 'bodea', version: '2.0' }],
    ])('leaves the project naming %s', async (_name, named) => {
        happyEngine();
        mockedWatch.mockResolvedValue({ outcome: 'success', perType: {} });
        const project = { ...PAAS_PROJECT(), datapack: named };
        const { context, saveProject } = makeImportHarness(project);

        await importHandlers['reset-datapack'](context, { ...PAYLOAD, confirm: true });
        await new Promise((resolve) => setImmediate(resolve));

        expect(project.datapack).toEqual(named);
        expect(saveProject).not.toHaveBeenCalled();
    });

    // Confirm-gated: an unconfirmed reset does nothing at all, including to the
    // project record.
    it('CONTROL — an unconfirmed reset changes nothing', async () => {
        happyEngine();
        const project = { ...PAAS_PROJECT(), datapack: { name: 'bodea', version: 'main' } };
        const { context, saveProject } = makeImportHarness(project);

        await importHandlers['reset-datapack'](context, PAYLOAD);

        expect(project.datapack).toEqual({ name: 'bodea', version: 'main' });
        expect(saveProject).not.toHaveBeenCalled();
    });
});
