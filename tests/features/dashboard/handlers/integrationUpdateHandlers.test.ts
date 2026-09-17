/**
 * integrationUpdateHandlers — Update does a real update, and the integrations
 * screen asks which integrations have one (AB-13, step 5).
 *
 * The runner's update and the runner deps are mocked; the check service is
 * real, driven through the deps' clone check. Assertions pin the arguments
 * each collaborator receives and the order the pair is updated in.
 */

import type { AppBuilderComponentState, Project } from '@/types/base';

jest.mock('vscode', () => {
    const vscode = jest.requireActual('../../../__mocks__/vscode') as { window: Record<string, unknown> };
    vscode.window.withProgress = async (
        _options: unknown,
        task: (p: { report: (value: { message?: string }) => void }) => unknown,
    ) => task({ report: () => undefined });
    return vscode;
});

const mockCheckComponentSource = jest.fn();
const mockReadAppVersion = jest.fn();
const mockBuildDefaultRunnerDeps = jest.fn((..._args: unknown[]) => ({
    checkComponentSource: mockCheckComponentSource,
    readAppVersion: mockReadAppVersion,
}));
jest.mock('@/features/project-creation/services/appBuilderComponentRunnerDeps', () => ({
    buildDefaultRunnerDeps: (...a: unknown[]) => mockBuildDefaultRunnerDeps(...a),
    buildRunnerDepsContext: jest.fn(async () => ({})),
    resolveAppManagementAuth: jest.fn(),
}));

const mockUpdate = jest.fn();
jest.mock('@/features/app-builder/services/appBuilderComponentRunner', () => ({
    updateAppBuilderComponent: (...a: unknown[]) => mockUpdate(...a),
}));

const mockCatalog = jest.fn();
jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => ({
    getAppBuilderComponentCatalog: () => mockCatalog(),
    getAppBuilderComponentEntry: jest.fn(),
    buildCustomIntegrationEntry: jest.fn(),
    entryFitsProjectAxes: jest.fn().mockReturnValue(true),
}));

jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({
            getTokenManager: () => ({ inspectToken: jest.fn(async () => ({ valid: false })) }),
            getCachedOrganization: jest.fn(),
        })),
        getCommandExecutor: jest.fn(() => ({ execute: jest.fn() })),
    },
}));

const mockEnsureAdobeIOAuth = jest.fn();
jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: (...a: unknown[]) => mockEnsureAdobeIOAuth(...a),
}));
jest.mock('@/features/authentication/services/detectProjectOrgMismatch', () => ({
    detectProjectOrgMismatch: jest.fn().mockResolvedValue({ reachable: true }),
}));

jest.mock('@/features/dashboard/handlers/dashboardHandlers', () => ({
    handleRequestStatus: jest.fn().mockResolvedValue({ success: true }),
}));
const mockSendStatus = jest.fn();
const mockSendSnapshot = jest.fn();
jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: {
        sendAppBuilderComponentStatusUpdate: (...a: unknown[]) => mockSendStatus(...a),
        sendAppBuilderComponentsSnapshot: (...a: unknown[]) => mockSendSnapshot(...a),
        refreshStatus: jest.fn(),
    },
}));

// Below the mocks on purpose: they hoist above these imports. The shared wall
// comes before the subject, or the subject binds to the real modules first.
import { setupMocks } from './dashboardHandlers.testUtils';
import {
    handleCheckIntegrationUpdates,
    handleUpdateAppBuilderComponent,
} from '@/features/dashboard/handlers/integrationUpdateHandlers';
import { ErrorCode } from '@/types/errorCodes';

const SOURCE = { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' };

function deployed(overrides: Partial<AppBuilderComponentState> = {}): AppBuilderComponentState {
    return { kind: 'integration', status: 'deployed', name: 'ERP integration', source: SOURCE, ...overrides };
}

function pairProject(erp: Partial<AppBuilderComponentState> = {}): Partial<Project> {
    return {
        appBuilderComponents: {
            'erp-integration': deployed(),
            'demo-erp': deployed({ kind: 'system', name: 'Nordwind', ...erp }),
        },
        componentInstances: {
            'erp-integration': { id: 'erp-integration', name: 'ERP integration', status: 'ready', path: '/p/erp-integration' },
            'demo-erp': { id: 'demo-erp', name: 'Nordwind', status: 'ready', path: '/p/demo-erp' },
        },
    };
}

/** setupMocks replaces the auth service; the guard's role check needs its answer back. */
function setup(overrides: Partial<Project>) {
    const mocks = setupMocks(overrides);
    const { ServiceLocator } = require('@/core/di/serviceLocator');
    ServiceLocator.getAuthenticationService().testDeveloperPermissions = jest
        .fn()
        .mockResolvedValue({ hasPermissions: true });
    return mocks;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
    mockCatalog.mockReturnValue([{ id: 'demo-erp', kind: 'system', boundTo: 'erp-integration' }]);
    mockCheckComponentSource.mockResolvedValue({ status: 'current' });
    mockReadAppVersion.mockResolvedValue(undefined);
    mockUpdate.mockResolvedValue({ success: true, detail: 'Updated the integration from a to b.' });
    mockBuildDefaultRunnerDeps.mockReturnValue({
        checkComponentSource: mockCheckComponentSource,
        readAppVersion: mockReadAppVersion,
    });
});

describe('handleCheckIntegrationUpdates', () => {
    it('records the updates it finds, saves, and refreshes the grid', async () => {
        const { mockContext, mockProject } = setup(pairProject());
        mockCheckComponentSource.mockImplementation(async (path: string) =>
            path === '/p/demo-erp' ? { status: 'available', to: 'abc123' } : { status: 'current' },
        );

        const result = await handleCheckIntegrationUpdates(mockContext);

        expect(result).toEqual({
            success: true,
            data: {
                updates: [
                    { id: 'erp-integration', available: false },
                    { id: 'demo-erp', available: true },
                ],
            },
        });
        expect(mockCheckComponentSource).toHaveBeenCalledWith('/p/demo-erp', 'main');
        expect(mockProject.appBuilderComponents?.['demo-erp']?.updateAvailable?.commit).toBe('abc123');
        expect(mockContext.stateManager.saveProject).toHaveBeenCalledWith(mockProject);
        expect(mockSendSnapshot).toHaveBeenCalledTimes(1);
    });

    it('saves nothing and pushes nothing when no answer changed', async () => {
        const { mockContext } = setup(pairProject());

        await handleCheckIntegrationUpdates(mockContext);

        expect(mockContext.stateManager.saveProject).not.toHaveBeenCalled();
        expect(mockSendSnapshot).not.toHaveBeenCalled();
    });

    it('runs no Adobe guard: it reads only GitHub and the clones', async () => {
        const { mockContext } = setup(pairProject());

        await handleCheckIntegrationUpdates(mockContext);

        expect(mockEnsureAdobeIOAuth).not.toHaveBeenCalled();
    });

    it('answers a refusal when the check is not wired', async () => {
        const { mockContext } = setup(pairProject());
        mockBuildDefaultRunnerDeps.mockReturnValue({} as ReturnType<typeof mockBuildDefaultRunnerDeps>);

        await expect(handleCheckIntegrationUpdates(mockContext)).resolves.toEqual({
            success: false,
            error: 'Checking for updates is not available here.',
        });
    });
});

describe('handleUpdateAppBuilderComponent', () => {
    it('updates the integration through the runner and answers its detail', async () => {
        const { mockContext, mockProject } = setup(pairProject());

        const result = await handleUpdateAppBuilderComponent(mockContext, { id: 'erp-integration' });

        expect(result).toEqual({ success: true, detail: 'Updated the integration from a to b.' });
        expect(mockUpdate).toHaveBeenCalledTimes(1);
        expect(mockUpdate).toHaveBeenCalledWith(mockProject, 'erp-integration', expect.anything());
        expect(mockSendStatus).toHaveBeenCalledWith('erp-integration', 'deployed', undefined, undefined);
        expect(mockSendSnapshot).toHaveBeenCalled();
    });

    it('updates the ERP first when it has an update', async () => {
        const { mockContext } = setup(pairProject({ updateAvailable: { commit: 'abc', checkedAt: 'x' } }));

        await handleUpdateAppBuilderComponent(mockContext, { id: 'erp-integration' });

        expect(mockUpdate.mock.calls.map((call) => call[1])).toEqual(['demo-erp', 'erp-integration']);
    });

    it('follows the stored link, not the catalog, to the system it updates first', async () => {
        const { mockContext } = setup({
            appBuilderComponents: {
                'erp-integration': deployed({ systems: ['erp-b'] }),
                'erp-b': deployed({ kind: 'system', usedBy: 'erp-integration', updateAvailable: { commit: 'b', checkedAt: 'x' } }),
                'demo-erp': deployed({ kind: 'system', updateAvailable: { commit: 'a', checkedAt: 'x' } }),
            },
        });

        await handleUpdateAppBuilderComponent(mockContext, { id: 'erp-integration' });

        expect(mockUpdate.mock.calls.map((call) => call[1])).toEqual(['erp-b', 'erp-integration']);
    });

    it('leaves the integration alone when the ERP update fails', async () => {
        const { mockContext } = setup(pairProject({ updateAvailable: { commit: 'abc', checkedAt: 'x' } }));
        mockUpdate.mockResolvedValueOnce({ success: false, error: 'npm ERR! ERESOLVE' });

        const result = await handleUpdateAppBuilderComponent(mockContext, { id: 'erp-integration' });

        expect(result).toEqual({
            success: false,
            error: 'The ERP did not update, so the integration was left as it is: npm ERR! ERESOLVE',
            code: undefined,
        });
        expect(mockUpdate).toHaveBeenCalledTimes(1);
        expect(mockSendStatus).toHaveBeenCalledWith('demo-erp', 'error', 'npm ERR! ERESOLVE', undefined);
    });

    it("passes the runner's refusal through, with the row in error", async () => {
        const { mockContext } = setup(pairProject());
        mockUpdate.mockResolvedValue({ success: false, error: 'The integration folder has changes of its own (a.js).' });

        const result = await handleUpdateAppBuilderComponent(mockContext, { id: 'erp-integration' });

        expect(result).toMatchObject({ success: false, error: 'The integration folder has changes of its own (a.js).' });
        expect(mockSendStatus).toHaveBeenLastCalledWith(
            'erp-integration',
            'error',
            'The integration folder has changes of its own (a.js).',
            undefined,
        );
    });

    it('a failed guard blocks before anything updates', async () => {
        const { mockContext } = setup(pairProject());
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false });

        const result = await handleUpdateAppBuilderComponent(mockContext, { id: 'erp-integration' });

        expect(result.code).toBe(ErrorCode.AUTH_REQUIRED);
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('refuses an undeployed integration, a mesh, an unknown id and a missing id', async () => {
        const { mockContext } = setup({
            appBuilderComponents: {
                broken: deployed({ status: 'error' }),
                mesh: deployed({ kind: 'mesh' }),
            },
        });

        await expect(handleUpdateAppBuilderComponent(mockContext, { id: 'broken' })).resolves.toMatchObject({
            success: false,
            code: ErrorCode.INVALID_OPERATION,
        });
        await expect(handleUpdateAppBuilderComponent(mockContext, { id: 'mesh' })).resolves.toMatchObject({
            code: ErrorCode.PROJECT_NOT_FOUND,
        });
        await expect(handleUpdateAppBuilderComponent(mockContext, { id: 'nope' })).resolves.toMatchObject({
            code: ErrorCode.PROJECT_NOT_FOUND,
        });
        await expect(handleUpdateAppBuilderComponent(mockContext, {})).resolves.toMatchObject({
            code: ErrorCode.CONFIG_INVALID,
        });
        expect(mockUpdate).not.toHaveBeenCalled();
    });
});
