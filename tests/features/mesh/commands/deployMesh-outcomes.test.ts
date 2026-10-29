/**
 * DeployMeshCommand — what the user is told after the core answers.
 *
 * The command owns UX only: the lock, the deps it assembles, and the mapping
 * from `deployMeshWithFeedback`'s result to a toast. The other five suites in
 * this family drive the whole spine with the core REAL, which is why they never
 * reach four of its five outcomes — `no-mesh`, `permission`, a raw deploy
 * failure and the outer catch were measured entirely unentered on 2026-09-06,
 * along with both "View Logs" jumps.
 *
 * So this one mocks the core and hands it each outcome in turn. The seam is the
 * dynamic `import('../services/deployMeshWithFeedback')`, which resolves to the
 * same module the alias names.
 */

import * as vscode from 'vscode';
import { DeployMeshCommand } from './deployMesh.testUtils';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { deployMeshWithFeedback } from '@/features/mesh/services/deployMeshWithFeedback';
import { meshDeployLock } from '@/features/mesh/services/meshDeployLock';
import { republishStorefrontConfig } from '@/features/eds/services/storefront/storefrontRepublishService';
import { ensureDaLiveAuth } from '@/features/eds/handlers/edsHelpers';
import type { StateManager } from '@/types/state';
import type { Logger } from '@/types/logger';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockProject } from '../../../helpers/projectFake';

jest.mock('@/features/mesh/services/deployMeshWithFeedback', () => ({
    deployMeshWithFeedback: jest.fn(),
}));

const mockRefreshStatus = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: { refreshStatus: mockRefreshStatus },
}));

// The two collaborators the command's `republishStorefront` callback reaches. The
// core is mocked here, so nothing but the callback itself ever calls them.
jest.mock('@/features/eds/services/storefront/storefrontRepublishService', () => ({
    republishStorefrontConfig: jest.fn(),
}));
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    ensureDaLiveAuth: jest.fn(),
}));

const mockedRepublish = republishStorefrontConfig as jest.MockedFunction<
    typeof republishStorefrontConfig
>;
const mockedEnsureDaLive = ensureDaLiveAuth as jest.MockedFunction<typeof ensureDaLiveAuth>;

const mockedDeploy = deployMeshWithFeedback as jest.MockedFunction<typeof deployMeshWithFeedback>;

type DeployResult = Awaited<ReturnType<typeof deployMeshWithFeedback>>;

const AUTH = { id: 'auth-service' };
const SECRETS = { id: 'secret-storage' };
const EXECUTOR = { id: 'command-executor' };
const PROJECT = createMockProject({ name: 'demo', path: '/demo' });

const PERMISSION_DEFAULT =
    'Your account lacks Developer or System Admin role for this organization. ' +
    'API Mesh deployment requires App Builder access. ' +
    'Contact your administrator to restore access.';

describe('DeployMeshCommand — result mapping', () => {
    let command: DeployMeshCommand;
    let stateManager: jest.Mocked<StateManager>;
    let logger: Logger;
    let context: vscode.ExtensionContext;
    let showSuccessMessage: jest.Mock;
    let showErrorMessage: jest.Mock;
    let showWarningMessage: jest.Mock;
    let executeCommand: jest.Mock;

    /** Give the core one outcome and run the command. */
    async function answering(result: Partial<DeployResult>): Promise<void> {
        mockedDeploy.mockResolvedValue(result as DeployResult);
        await command.execute();
    }

    beforeEach(() => {
        jest.clearAllMocks();

        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(AUTH);
        (ServiceLocator.getSecretStorage as jest.Mock).mockReturnValue(SECRETS);
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(EXECUTOR);

        stateManager = createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(PROJECT),
        }) as unknown as jest.Mocked<StateManager>;
        logger = createMockLogger() as unknown as Logger;

        context = createMockExtensionContext({ extensionPath: '/ext' });
        command = new DeployMeshCommand(context, stateManager, logger);
        // The success toast stands up a progress notification that sleeps; the
        // decision under test is WHICH branch ran, not how the toast is drawn.
        showSuccessMessage = jest.fn().mockResolvedValue(undefined);
        Object.assign(command, { showSuccessMessage });

        showErrorMessage = jest.fn().mockResolvedValue(undefined);
        showWarningMessage = jest.fn().mockResolvedValue(undefined);
        executeCommand = jest.fn().mockResolvedValue(undefined);
        (vscode.window.showErrorMessage as unknown as jest.Mock) = showErrorMessage;
        (vscode.window.showWarningMessage as unknown as jest.Mock) = showWarningMessage;
        (vscode.commands.executeCommand as unknown as jest.Mock) = executeCommand;
    });

    describe('before the core is called at all', () => {
        it('does nothing when a deploy is already running', async () => {
            // The lock is shared with the screen's modal path now (PL-59 phase 2).
            jest.spyOn(meshDeployLock, 'isLocked').mockReturnValue(true);

            await command.execute();

            expect(mockedDeploy).not.toHaveBeenCalled();
        });

        it('warns and stops when no project is open', async () => {
            stateManager.getCurrentProject = jest.fn().mockResolvedValue(null);

            await command.execute();

            expect(showWarningMessage).toHaveBeenCalledWith(
                'No active project found. Create a project first.',
            );
            expect(mockedDeploy).not.toHaveBeenCalled();
        });

        it('hands the core the live services, the project and the extension path', async () => {
            await answering({ success: true });

            expect(mockedDeploy).toHaveBeenCalledWith(
                expect.objectContaining({
                    authManager: AUTH,
                    secrets: SECRETS,
                    commandManager: EXECUTOR,
                    project: PROJECT,
                    stateManager,
                    logger,
                    extensionPath: '/ext',
                }),
            );
        });

        it('hands the core no secret storage at all when none is registered', async () => {
            (ServiceLocator.getSecretStorage as jest.Mock).mockReturnValue(null);

            await answering({ success: true });

            // The core's field is optional, and `null` is not "absent" to it.
            expect(mockedDeploy.mock.calls[0][0].secrets).toBeUndefined();
        });
    });

    describe('the storefront republish the core is handed', () => {
        const DEPLOYED = createMockProject({ name: 'demo-after-deploy', path: '/demo' });

        /** Run a deploy, then call the callback the core was given, as the core would. */
        async function republishing(): Promise<unknown> {
            await answering({ success: true });
            const { republishStorefront } = mockedDeploy.mock.calls[0][0];
            return republishStorefront?.(DEPLOYED);
        }

        it('republishes the DEPLOYED project, not the one read before the deploy', async () => {
            const outcome = { success: true, githubPushed: true, cdnPublished: true };
            mockedRepublish.mockResolvedValue(outcome);

            const answer = await republishing();

            expect(mockedRepublish).toHaveBeenCalledWith(
                expect.objectContaining({
                    project: DEPLOYED,
                    secrets: context.secrets,
                    logger,
                }),
            );
            expect(answer).toBe(outcome);
        });

        it('saves what the republish changed through the command state manager', async () => {
            await republishing();
            const changed = createMockProject({ name: 'demo-republished', path: '/demo' });

            await mockedRepublish.mock.calls[0][0].persist?.(changed);

            expect(stateManager.saveProject).toHaveBeenCalledWith(changed);
        });

        it('asks for the DA.live session with the command context, tagged as a mesh deploy', async () => {
            mockedEnsureDaLive.mockResolvedValue({ authenticated: true });
            await republishing();

            const session = await mockedRepublish.mock.calls[0][0].ensureDaLiveSession?.();

            expect(mockedEnsureDaLive).toHaveBeenCalledWith({ context, logger }, '[Mesh Deploy]');
            expect(session).toStrictEqual({ authenticated: true });
        });
    });

    describe('success', () => {
        it('clears the mesh notification flag and shows no failure toast', async () => {
            await answering({ success: true });

            expect(executeCommand).toHaveBeenCalledWith('demoBuilder._internal.meshActionTaken');
            expect(showSuccessMessage).toHaveBeenCalledWith('API Mesh deployed successfully');
            expect(showWarningMessage).not.toHaveBeenCalled();
            expect(showErrorMessage).not.toHaveBeenCalled();
            expect(mockRefreshStatus).not.toHaveBeenCalled();
        });
    });

    describe('deployed, but the storefront was not republished', () => {
        const REASON = 'DA.live sign-in is needed to publish config.json';

        it('warns with the reason instead of claiming a clean success', async () => {
            await answering({ success: true, storefrontNotRepublished: REASON });

            expect(showWarningMessage).toHaveBeenCalledWith(
                `API Mesh deployed, but the storefront was not republished: ${REASON}`,
            );
            expect(showSuccessMessage).not.toHaveBeenCalled();
        });

        it('still clears the mesh notification flag, because the mesh DID deploy', async () => {
            await answering({ success: true, storefrontNotRepublished: REASON });

            expect(executeCommand).toHaveBeenCalledWith('demoBuilder._internal.meshActionTaken');
            expect(showErrorMessage).not.toHaveBeenCalled();
        });

        it('says nothing of the storefront when the deploy itself failed', async () => {
            // The field can ride on a failed result; a failure is reported as a failure.
            await answering({ success: false, storefrontNotRepublished: REASON });

            expect(showWarningMessage).not.toHaveBeenCalled();
            expect(executeCommand).not.toHaveBeenCalledWith(
                'demoBuilder._internal.meshActionTaken',
            );
            expect(showErrorMessage).toHaveBeenCalledWith(
                'Mesh deployment failed. Check logs for details.',
                'View Logs',
            );
        });
    });

    describe('a guard stopped it (blockedBy)', () => {
        it('refreshes the dashboard and names the wrong-org recovery', async () => {
            await answering({ success: false, blockedBy: 'org' });

            expect(mockRefreshStatus).toHaveBeenCalled();
            expect(showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('wrong Adobe organization'),
            );
        });

        it('names sign-in when the block was auth, not org', async () => {
            await answering({ success: false, blockedBy: 'auth' });

            expect(showErrorMessage).toHaveBeenCalledWith(
                'Sign-in failed or was cancelled. Please try again.',
            );
        });

        it('stays quiet when the user cancelled the sign-in themselves', async () => {
            await answering({ success: false, blockedBy: 'auth', cancelled: true });

            expect(showErrorMessage).not.toHaveBeenCalled();
            expect(mockRefreshStatus).toHaveBeenCalled();
        });

        it('WARNS (not errors) when the project simply has no mesh component', async () => {
            await answering({ success: false, blockedBy: 'no-mesh' });

            expect(showWarningMessage).toHaveBeenCalledWith(
                'This project does not have an API Mesh component.',
            );
            expect(showErrorMessage).not.toHaveBeenCalled();
        });

        it("surfaces the core's own message for a permission block", async () => {
            await answering({
                success: false,
                blockedBy: 'permission',
                error: 'org 285361 has no App Builder entitlement',
            });

            expect(showErrorMessage).toHaveBeenCalledWith(
                'org 285361 has no App Builder entitlement',
            );
            expect(showWarningMessage).not.toHaveBeenCalled();
        });

        it('falls back to the role explanation when the core gave no message', async () => {
            await answering({ success: false, blockedBy: 'permission' });

            expect(showErrorMessage).toHaveBeenCalledWith(PERMISSION_DEFAULT);
        });
    });

    describe('a raw deploy failure', () => {
        it('offers View Logs and does NOT refresh the dashboard', async () => {
            await answering({ success: false });

            expect(showErrorMessage).toHaveBeenCalledWith(
                'Mesh deployment failed. Check logs for details.',
                'View Logs',
            );
            expect(mockRefreshStatus).not.toHaveBeenCalled();
        });

        it('opens the logs when View Logs is chosen', async () => {
            showErrorMessage.mockResolvedValue('View Logs');

            await answering({ success: false });

            expect(executeCommand).toHaveBeenCalledWith('demoBuilder.showLogs');
        });

        it('opens nothing when the toast is dismissed', async () => {
            showErrorMessage.mockResolvedValue(undefined);

            await answering({ success: false });

            expect(executeCommand).not.toHaveBeenCalledWith('demoBuilder.showLogs');
        });
    });

    describe('an unexpected throw', () => {
        it('is caught and reported rather than escaping the command', async () => {
            mockedDeploy.mockRejectedValue(new Error('ServiceLocator not initialised'));

            await expect(command.execute()).resolves.toBeUndefined();

            expect(showErrorMessage).toHaveBeenCalledWith(
                'Failed to deploy API Mesh. Check logs for details.',
                'View Logs',
            );
        });

        it('opens the logs from that toast too', async () => {
            mockedDeploy.mockRejectedValue(new Error('boom'));
            showErrorMessage.mockResolvedValue('View Logs');

            await command.execute();

            expect(executeCommand).toHaveBeenCalledWith('demoBuilder.showLogs');
        });

        it('opens nothing when that toast is dismissed', async () => {
            mockedDeploy.mockRejectedValue(new Error('boom'));
            showErrorMessage.mockResolvedValue(undefined);

            await command.execute();

            expect(executeCommand).not.toHaveBeenCalledWith('demoBuilder.showLogs');
        });
    });
});
