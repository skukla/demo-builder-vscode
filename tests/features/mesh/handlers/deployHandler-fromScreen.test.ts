/**
 * deployHandler — the screen button's door into the mesh deploy, and the inputs both
 * doors hand the deploy.
 *
 * `deployMeshFromScreen` (PL-59 phase 2) had no test: nothing checked that it reports
 * to the screen's modal under the id the screen chose, that it holds the one mesh
 * lock while it runs, or that the dashboard is told afterwards. The deploy itself is
 * mocked here, so every claim is made on the ARGUMENTS it receives — a mock answers
 * the same whatever it is handed.
 */

const mockDeployMeshWithFeedback = jest.fn();
jest.mock('@/features/mesh/services/deployMeshWithFeedback', () => ({
    deployMeshWithFeedback: (...args: unknown[]) => mockDeployMeshWithFeedback(...args),
}));

const mockRepublishStorefrontConfig = jest.fn();
jest.mock('@/features/eds/services/storefront/storefrontRepublishService', () => ({
    republishStorefrontConfig: (...args: unknown[]) => mockRepublishStorefrontConfig(...args),
}));

const mockEnsureDaLiveAuth = jest.fn();
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    ensureDaLiveAuth: (...args: unknown[]) => mockEnsureDaLiveAuth(...args),
}));

import * as vscode from 'vscode';
import { deployMeshFromScreen, handleDeployApiMesh } from '@/features/mesh/handlers/deployHandler';
import type { DeployMeshWithFeedbackDeps } from '@/features/mesh/services/deployMeshWithFeedback';
import { meshDeployLock } from '@/features/mesh/services/meshDeployLock';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { ErrorCode } from '@/types/errorCodes';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const PROJECT = { name: 'p', path: '/p' } as Project;
const DEPLOYED = { success: true, meshId: 'm1', endpoint: 'https://mesh/graphql' };
const ACTION_TAKEN = 'demoBuilder._internal.meshActionTaken';

const authManager = createMockAuthenticationService();
const commandManager = createMockCommandExecutor();

function ctx(project: Project | null = PROJECT): HandlerContext {
    return createMockHandlerContext({
        stateManager: createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(project) }),
        logger: createMockLogger(),
        context: createMockExtensionContext({ extensionPath: '/ext' }),
    });
}

/** The deps the deploy was handed on its only call. */
function handedDeps(): DeployMeshWithFeedbackDeps {
    expect(mockDeployMeshWithFeedback).toHaveBeenCalledTimes(1);
    return mockDeployMeshWithFeedback.mock.calls[0][0] as DeployMeshWithFeedbackDeps;
}

beforeEach(() => {
    jest.clearAllMocks();
    // The shared node setup empties the registry after every test (ADR-015).
    ServiceLocator.setAuthenticationService(authManager);
    ServiceLocator.setCommandExecutor(commandManager);
    mockDeployMeshWithFeedback.mockResolvedValue(DEPLOYED);
});

describe('deployMeshFromScreen', () => {
    it("reports to the screen's modal, under the id the screen named the operation by", async () => {
        const context = ctx();

        await deployMeshFromScreen(context, 'op-42');

        expect(mockDeployMeshWithFeedback).toHaveBeenCalledWith(
            expect.objectContaining({ project: PROJECT }),
            { progress: 'modal', operationId: 'op-42' },
        );
    });

    it('answers the mesh id and endpoint, and tells the dashboard a mesh action was taken', async () => {
        const result = await deployMeshFromScreen(ctx(), 'op-42');

        expect(result).toStrictEqual({ success: true, data: { meshId: 'm1', endpoint: 'https://mesh/graphql' } });
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(1);
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(ACTION_TAKEN);
    });

    it('carries the storefront warning the same way the tool does', async () => {
        mockDeployMeshWithFeedback.mockResolvedValue({ ...DEPLOYED, storefrontNotRepublished: 'the republish did not finish' });

        const result = await deployMeshFromScreen(ctx(), 'op-42');

        expect(result.data).toStrictEqual({
            meshId: 'm1',
            endpoint: 'https://mesh/graphql',
            warning: 'The mesh is deployed, but the storefront was not republished: the republish did not finish',
        });
    });

    it("answers a failure with the deploy's reason, and reports no mesh action", async () => {
        mockDeployMeshWithFeedback.mockResolvedValue({ success: false, error: 'The mesh did not build.' });

        const result = await deployMeshFromScreen(ctx(), 'op-42');

        expect(result).toStrictEqual({ success: false, error: 'The mesh did not build.' });
        expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it('refuses with no project open, before anything is deployed', async () => {
        const result = await deployMeshFromScreen(ctx(null), 'op-42');

        expect(result).toStrictEqual({
            success: false,
            error: 'No project found',
            code: ErrorCode.PROJECT_NOT_FOUND,
        });
        expect(mockDeployMeshWithFeedback).not.toHaveBeenCalled();
    });

    it('holds the mesh lock for the whole deploy, and lets go when it ends', async () => {
        let lockedDuringDeploy: boolean | undefined;
        mockDeployMeshWithFeedback.mockImplementation(async () => {
            lockedDuringDeploy = meshDeployLock.isLocked();
            return DEPLOYED;
        });

        await deployMeshFromScreen(ctx(), 'op-42');

        expect(lockedDuringDeploy).toBe(true);
        expect(meshDeployLock.isLocked()).toBe(false);
    });

    it('refuses a second deploy while one is running, without reading the project', async () => {
        // One deploy at a time, whichever door started it: the palette command holds
        // this same lock.
        const release = await meshDeployLock.acquire();
        const context = ctx();
        try {
            const result = await deployMeshFromScreen(context, 'op-42');

            expect(result).toStrictEqual({ success: false, error: 'A mesh deploy is already running.' });
            expect(context.stateManager.getCurrentProject).not.toHaveBeenCalled();
            expect(mockDeployMeshWithFeedback).not.toHaveBeenCalled();
        } finally {
            release();
        }
    });
});

// Both doors assemble the deploy's inputs once, in one place. The storefront republish
// is handed in as a function, because the storefront is another feature's.
describe("the deploy's inputs, from either door", () => {
    it('hands over the registered services, the project and where the extension lives', async () => {
        const { secrets } = createMockSecretStorage();
        ServiceLocator.setSecretStorage(secrets);
        const context = ctx();

        await handleDeployApiMesh(context);

        const deps = handedDeps();
        expect(deps.authManager).toBe(authManager);
        expect(deps.commandManager).toBe(commandManager);
        expect(deps.secrets).toBe(secrets);
        expect(deps.project).toBe(PROJECT);
        expect(deps.stateManager).toBe(context.stateManager);
        expect(deps.logger).toBe(context.logger);
        expect(deps.extensionPath).toBe('/ext');
    });

    it('the tool door asks for no modal — an agent has no screen', async () => {
        await handleDeployApiMesh(ctx());

        expect(mockDeployMeshWithFeedback.mock.calls[0]).toHaveLength(1);
    });

    it('republishes the DEPLOYED project, saving through the state manager', async () => {
        const context = ctx();
        const deployed = { name: 'p', path: '/p', status: 'ready' } as Project;
        const outcome = { success: true, cdnPublished: true };
        mockRepublishStorefrontConfig.mockResolvedValue(outcome);
        await deployMeshFromScreen(context, 'op-42');

        const answered = await handedDeps().republishStorefront?.(deployed);

        expect(answered).toBe(outcome);
        expect(mockRepublishStorefrontConfig).toHaveBeenCalledTimes(1);
        const params = mockRepublishStorefrontConfig.mock.calls[0][0];
        // The project the deploy just changed, not the one read before it ran.
        expect(params.project).toBe(deployed);
        expect(params.secrets).toBe(context.context.secrets);
        expect(params.logger).toBe(context.logger);

        const saved = { name: 'p', path: '/p', status: 'ready' } as Project;
        await params.persist(saved);
        expect(context.stateManager.saveProject).toHaveBeenCalledWith(saved);
    });

    it('lets the republish ask for a DA.live sign-in through this screen', async () => {
        const context = ctx();
        const session = { authenticated: true };
        mockEnsureDaLiveAuth.mockResolvedValue(session);
        mockRepublishStorefrontConfig.mockResolvedValue({ success: true });
        await deployMeshFromScreen(context, 'op-42');
        await handedDeps().republishStorefront?.(PROJECT);

        const answered = await mockRepublishStorefrontConfig.mock.calls[0][0].ensureDaLiveSession();

        expect(answered).toBe(session);
        expect(mockEnsureDaLiveAuth).toHaveBeenCalledWith(context, expect.any(String));
    });
});
