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

        command = new DeployMeshCommand(
            createMockExtensionContext({ extensionPath: '/ext' }),
            stateManager,
            logger,
        );
        // The success toast stands up a progress notification that sleeps; the
        // decision under test is WHICH branch ran, not how the toast is drawn.
        Object.assign(command, { showSuccessMessage: jest.fn().mockResolvedValue(undefined) });

        showErrorMessage = jest.fn().mockResolvedValue(undefined);
        showWarningMessage = jest.fn().mockResolvedValue(undefined);
        executeCommand = jest.fn().mockResolvedValue(undefined);
        (vscode.window.showErrorMessage as unknown as jest.Mock) = showErrorMessage;
        (vscode.window.showWarningMessage as unknown as jest.Mock) = showWarningMessage;
        (vscode.commands.executeCommand as unknown as jest.Mock) = executeCommand;
    });

    describe('before the core is called at all', () => {
        it('does nothing when a deploy is already running', async () => {
            const lock = (DeployMeshCommand as unknown as { lock: { isLocked(): boolean } }).lock;
            jest.spyOn(lock, 'isLocked').mockReturnValue(true);

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
    });

    describe('success', () => {
        it('clears the mesh notification flag and shows no failure toast', async () => {
            await answering({ success: true });

            expect(executeCommand).toHaveBeenCalledWith('demoBuilder._internal.meshActionTaken');
            expect(showErrorMessage).not.toHaveBeenCalled();
            expect(mockRefreshStatus).not.toHaveBeenCalled();
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
