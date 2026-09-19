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
const mockSendOperationProgress = jest.fn();
jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: {
        sendAppBuilderComponentStatusUpdate: (...a: unknown[]) => mockSendStatus(...a),
        sendAppBuilderComponentsSnapshot: (...a: unknown[]) => mockSendSnapshot(...a),
        sendComponentOperationProgress: (...a: unknown[]) => mockSendOperationProgress(...a),
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
            error: 'Nordwind did not update, so ERP integration was left as it is: npm ERR! ERESOLVE',
            code: undefined,
        });
        expect(mockUpdate).toHaveBeenCalledTimes(1);
        expect(mockSendStatus).toHaveBeenCalledWith('demo-erp', 'error', 'npm ERR! ERESOLVE', undefined);
    });

    // The pair updates as a unit from EITHER card (owner, 2026-09-18): its code
    // changes together, and updating one half leaves a mismatch nothing warns about.
    it("from the ERP's card: the ERP, then the integration when it has newer code too", async () => {
        const { mockContext } = setup({
            ...pairProject({ updateAvailable: { commit: 'abc', checkedAt: 'x' } }),
            appBuilderComponents: {
                'erp-integration': deployed({ updateAvailable: { commit: 'def', checkedAt: 'x' } }),
                'demo-erp': deployed({ kind: 'system', name: 'Nordwind', updateAvailable: { commit: 'abc', checkedAt: 'x' } }),
            },
        });

        await handleUpdateAppBuilderComponent(mockContext, { id: 'demo-erp' });

        expect(mockUpdate.mock.calls.map((call) => call[1])).toEqual(['demo-erp', 'erp-integration']);
    });

    it("from the ERP's card: the ERP alone when the integration has nothing newer", async () => {
        const { mockContext } = setup(pairProject({ updateAvailable: { commit: 'abc', checkedAt: 'x' } }));

        await handleUpdateAppBuilderComponent(mockContext, { id: 'demo-erp' });

        expect(mockUpdate.mock.calls.map((call) => call[1])).toEqual(['demo-erp']);
    });

    it('a card whose last deploy failed can update: Update does Retry\'s job too', async () => {
        const { mockContext } = setup({
            ...pairProject(),
            appBuilderComponents: {
                'erp-integration': deployed({ status: 'error', updateAvailable: { commit: 'def', checkedAt: 'x' } }),
                'demo-erp': deployed({ kind: 'system', name: 'Nordwind', status: 'error' }),
            },
        });

        const result = await handleUpdateAppBuilderComponent(mockContext, { id: 'erp-integration' });

        expect(result.success).toBe(true);
        expect(mockUpdate.mock.calls.map((call) => call[1])).toEqual(['demo-erp', 'erp-integration']);
    });

    it('redeploys the ERP first when its last deploy failed, even with nothing newer', async () => {
        // Bodea, 2026-09-18: an earlier Update fetched the ERP's code and then
        // failed to deploy. The ERP had no update left to record, so a pair update
        // skipped it and left its card failed.
        const { mockContext } = setup({
            ...pairProject(),
            appBuilderComponents: {
                'erp-integration': deployed({ status: 'error', updateAvailable: { commit: 'def', checkedAt: 'x' } }),
                'demo-erp': deployed({ kind: 'system', name: 'Nordwind', status: 'error' }),
            },
        });

        await handleUpdateAppBuilderComponent(mockContext, { id: 'erp-integration' });

        expect(mockUpdate.mock.calls.map((call) => call[1])).toEqual(['demo-erp', 'erp-integration']);
    });

    it('every card the click covers says so at once: the rest wait their turn', async () => {
        const { mockContext } = setup(pairProject({ updateAvailable: { commit: 'abc', checkedAt: 'x' } }));
        const seen: unknown[][] = [];
        mockSendStatus.mockImplementation((...args: unknown[]) => { seen.push(args.slice(0, 3)); });

        await handleUpdateAppBuilderComponent(mockContext, { id: 'erp-integration' });

        const waiting = seen.findIndex((call) => call[0] === 'erp-integration' && call[2] === 'Waiting to update');
        const erpUpdating = seen.findIndex((call) => call[0] === 'demo-erp' && call[2] === 'Updating…');
        const integrationUpdating = seen.findIndex((call) => call[0] === 'erp-integration' && call[2] === 'Updating…');
        expect(waiting).toBeGreaterThanOrEqual(0);
        expect(waiting).toBeLessThan(erpUpdating);
        expect(erpUpdating).toBeLessThan(integrationUpdating);
    });

    it('a failed ERP update returns the waiting integration to its own status, saying why', async () => {
        const { mockContext } = setup(pairProject({ updateAvailable: { commit: 'abc', checkedAt: 'x' } }));
        mockUpdate.mockResolvedValueOnce({ success: false, error: 'npm ERR! ERESOLVE' });

        await handleUpdateAppBuilderComponent(mockContext, { id: 'erp-integration' });

        expect(mockSendStatus).toHaveBeenCalledWith(
            'erp-integration',
            'deployed',
            'Left as it is: Nordwind did not update.',
            undefined,
        );
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
                broken: deployed({ status: 'not-deployed' }),
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

/** The real builder hands its progress reporter on as the deps' `onProgress`; so does this. */
function keepReporter(): void {
    mockBuildDefaultRunnerDeps.mockImplementation((...args: unknown[]) => ({
        checkComponentSource: mockCheckComponentSource,
        readAppVersion: mockReadAppVersion,
        onProgress: args[1],
    }));
}

// PL-59, adopted when develop merged in: an Update started on the integrations
// screen narrates to its modal, like Deploy, Install and Remove.
describe('handleUpdateAppBuilderComponent — started from the integrations screen', () => {
    it('runs in the modal, ends there, and opens no notification', async () => {
        const vscode = jest.requireMock('vscode') as { window: { withProgress: (...args: unknown[]) => unknown } };
        const withProgress = jest.spyOn(vscode.window, 'withProgress');
        const { mockContext } = setup(pairProject());

        await handleUpdateAppBuilderComponent(mockContext, { id: 'erp-integration', progress: 'modal' });

        expect(mockSendOperationProgress).toHaveBeenNthCalledWith(1, { id: 'erp-integration', state: 'running' });
        expect(mockSendOperationProgress).toHaveBeenLastCalledWith(
            expect.objectContaining({ id: 'erp-integration', state: 'succeeded' }),
        );
        expect(withProgress).not.toHaveBeenCalled();
    });

    it('says which of the pair each update is on: the ERP 1 of 2, the integration 2 of 2', async () => {
        keepReporter();
        const { mockContext } = setup(pairProject({ updateAvailable: { commit: 'abc', checkedAt: 'x' } }));
        mockUpdate.mockImplementation(async (_project, _id, deps: { onProgress?: (m: string) => void }) => {
            deps.onProgress?.('Deploying the app');
            return { success: true, detail: 'done' };
        });

        await handleUpdateAppBuilderComponent(mockContext, { id: 'erp-integration', progress: 'modal' });

        const positions = mockSendOperationProgress.mock.calls
            .map(([payload]) => payload)
            .filter((payload) => payload.stage === 'Deploying the app')
            .map((payload) => payload.position);
        expect(positions).toEqual([
            { index: 1, total: 2 },
            { index: 2, total: 2 },
        ]);
    });

    it('a single update carries no count', async () => {
        keepReporter();
        const { mockContext } = setup(pairProject());
        mockUpdate.mockImplementation(async (_project, _id, deps: { onProgress?: (m: string) => void }) => {
            deps.onProgress?.('Deploying the app');
            return { success: true, detail: 'done' };
        });

        await handleUpdateAppBuilderComponent(mockContext, { id: 'erp-integration', progress: 'modal' });

        const running = mockSendOperationProgress.mock.calls
            .map(([payload]) => payload)
            .filter((payload) => payload.stage === 'Deploying the app');
        expect(running).toHaveLength(1);
        expect(running[0].position).toBeUndefined();
    });

    it('ends the modal with the refusal when the card cannot update', async () => {
        const { mockContext } = setup({
            appBuilderComponents: { 'erp-integration': deployed({ status: 'not-deployed' }) },
        });

        await handleUpdateAppBuilderComponent(mockContext, { id: 'erp-integration', progress: 'modal' });

        expect(mockSendOperationProgress).toHaveBeenLastCalledWith({
            id: 'erp-integration',
            state: 'failed',
            error: '"erp-integration" is not deployed; deploy it instead of updating it.',
        });
    });
});
