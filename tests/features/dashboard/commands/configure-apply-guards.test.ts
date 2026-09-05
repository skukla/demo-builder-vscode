/**
 * ConfigureProjectWebviewCommand — the mesh/restart prompts and the guard rails
 * around applying them.
 *
 * Split from `configure-notifications` for size; the file-length rule is the only
 * reason. These four blocks share a subject with that suite and differ from it in
 * what they drive: the two prompts whose wording changes with whether the demo is
 * running, and the two wrappers every "apply" answer passes through — the Adobe
 * sign-in guard and the Save-button lock.
 */


import { ConfigureProjectWebviewCommand } from './configure.testUtils';
import * as vscode from 'vscode';
import { ServiceLocator } from '@/core/di/serviceLocator';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const mockIsEdsProject = jest.fn(() => true);
jest.mock('@/types/typeGuards', () => ({
    ...jest.requireActual('@/types/typeGuards'),
    isEdsProject: (...args: unknown[]) => mockIsEdsProject(...(args as [])),
}));

const mockMarkMeshUpdateDeclined = jest.fn(() => true);
jest.mock('@/features/mesh/services/meshUpdateDecline', () => ({
    markMeshUpdateDeclined: (...args: unknown[]) => mockMarkMeshUpdateDeclined(...(args as [])),
}));

const mockRefreshStatus = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: {
        refreshStatus: (...args: unknown[]) => mockRefreshStatus(...args),
        sendAuthoringExperienceUpdate: jest.fn().mockResolvedValue(undefined),
    },
}));

// ensureAuthAndApply reaches the guard through a dynamic import; jest.mock
// intercepts that the same way it does a static one.
const mockEnsureAdobeIOAuth = jest.fn();
jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: (...args: unknown[]) => mockEnsureAdobeIOAuth(...args),
}));

/**
 * The private notification surface this suite drives.
 *
 * Named rather than `as any`: a typo in one of these five is then a compile
 * error instead of a silently-created property that leaves the real method in
 * place and the test asserting nothing.
 */
interface NotificationInternals {
    showPostSaveNotifications(
        project: Project,
        meshChanges: { hasChanges: boolean },
        storefrontChanges: { hasChanges: boolean },
        authoringChanged?: boolean
    ): Promise<void>;
    handleCombinedMeshStorefrontNotification(project: Project): Promise<boolean>;
    handleStorefrontOnlyNotification(project: Project): Promise<boolean>;
    handleMeshOnlyNotification(project: Project): Promise<boolean>;
    handleRestartNotification(): Promise<boolean>;
    ensureAuthAndApply(
        operation: () => Promise<void>,
        operationDescription: string
    ): Promise<boolean>;
    withDeploymentStatus<T>(operation: () => Promise<T>): Promise<T>;
    republishStorefront(project: Project): Promise<void>;
    communicationManager: unknown;
}

function notifications(command: ConfigureProjectWebviewCommand): NotificationInternals {
    return command as unknown as NotificationInternals;
}

/**
 * Route the `_internal.shouldShow*` queries by command id.
 *
 * The command asks up to two of them per prompt, so a blanket
 * `mockResolvedValue` cannot express "mesh yes, storefront no" — the case that
 * decides whether the combined prompt appears at all.
 */
function answerShouldShow(answers: Record<string, unknown>): void {
    (vscode.commands.executeCommand as jest.Mock).mockImplementation((id: string) =>
        Promise.resolve(id in answers ? answers[id] : undefined)
    );
}

const MESH_SHOW = 'demoBuilder._internal.shouldShowMeshNotification';
const RESTART_SHOW = 'demoBuilder._internal.shouldShowRestartNotification';

describe('ConfigureProjectWebviewCommand - apply prompts and their guards', () => {
    let command: ConfigureProjectWebviewCommand;
    let stateManager: ReturnType<typeof createMockStateManager>;
    let logger: Logger;
    let project: Project;

    beforeEach(() => {
        jest.clearAllMocks();
        mockIsEdsProject.mockReturnValue(true);
        mockMarkMeshUpdateDeclined.mockReturnValue(true);
        mockRefreshStatus.mockResolvedValue(undefined);
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);
        (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue(undefined);
        answerShouldShow({});

        project = createMockProject({ name: 'Test', path: '/test/project' });
        stateManager = createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
        });
        logger = createMockLogger() as unknown as Logger;
        command = new ConfigureProjectWebviewCommand(
            createMockExtensionContext(),
            stateManager,
            logger
        );
        ServiceLocator.setAuthenticationService(createMockAuthenticationService());
    });

    // ── Mesh-only prompt ─────────────────────────────────────────────────────

    describe('mesh-only prompt', () => {
        it('suppresses itself once the flag is spent', async () => {
            answerShouldShow({ [MESH_SHOW]: false });

            const shown = await notifications(command).handleMeshOnlyNotification(project);

            expect(shown).toBe(false);
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
            expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        });

        it('warns (and says "restart demo") when the demo is running', async () => {
            answerShouldShow({ [MESH_SHOW]: true });

            await notifications(command).handleMeshOnlyNotification(
                createMockProject({ status: 'running' })
            );

            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                'Configuration saved. Redeploy mesh and restart demo to apply changes.',
                'Redeploy Mesh',
                'Later'
            );
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        });

        it('informs (no restart wording) when the demo is stopped', async () => {
            answerShouldShow({ [MESH_SHOW]: true });

            await notifications(command).handleMeshOnlyNotification(
                createMockProject({ status: 'stopped' })
            );

            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                'Configuration saved. Redeploy mesh to apply changes.',
                'Redeploy Mesh',
                'Later'
            );
            expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        });

        it('"Redeploy Mesh" deploys behind the deploying flag', async () => {
            answerShouldShow({ [MESH_SHOW]: true });
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Redeploy Mesh');
            mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
            const sendMessage = jest.fn().mockResolvedValue(undefined);
            notifications(command).communicationManager = { sendMessage };

            await notifications(command).handleMeshOnlyNotification(
                createMockProject({ status: 'stopped' })
            );

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.deployMesh');
            expect(sendMessage).toHaveBeenLastCalledWith('deployment-status', {
                isDeploying: false,
            });
        });

        it('"Later" saves the decline when one was recorded', async () => {
            answerShouldShow({ [MESH_SHOW]: true });
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Later');
            const stopped = createMockProject({ status: 'stopped' });

            await notifications(command).handleMeshOnlyNotification(stopped);

            expect(mockMarkMeshUpdateDeclined).toHaveBeenCalledWith(stopped);
            expect(stateManager.saveProject).toHaveBeenCalledWith(stopped);
            expect(mockRefreshStatus).toHaveBeenCalled();
        });

        it('reports the prompt as shown so no generic toast follows it', async () => {
            answerShouldShow({ [MESH_SHOW]: true });
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

            const shown = await notifications(command).handleMeshOnlyNotification(
                createMockProject({ status: 'stopped' })
            );

            expect(shown).toBe(true);
        });

        it('records NO decline when the prompt is simply dismissed', async () => {
            answerShouldShow({ [MESH_SHOW]: true });
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

            await notifications(command).handleMeshOnlyNotification(
                createMockProject({ status: 'stopped' })
            );

            expect(mockMarkMeshUpdateDeclined).not.toHaveBeenCalled();
            expect(stateManager.saveProject).not.toHaveBeenCalled();
        });

        it('"Later" saves NOTHING when there is no mesh entry to decline', async () => {
            answerShouldShow({ [MESH_SHOW]: true });
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Later');
            mockMarkMeshUpdateDeclined.mockReturnValue(false);

            await notifications(command).handleMeshOnlyNotification(
                createMockProject({ status: 'stopped' })
            );

            expect(stateManager.saveProject).not.toHaveBeenCalled();
        });
    });

    // ── Restart prompt ───────────────────────────────────────────────────────

    describe('restart prompt', () => {
        it('suppresses itself once the flag is spent', async () => {
            answerShouldShow({ [RESTART_SHOW]: false });

            const shown = await notifications(command).handleRestartNotification();

            expect(shown).toBe(false);
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        });

        it('offers a single Restart Demo action and spends the flag', async () => {
            answerShouldShow({ [RESTART_SHOW]: true });

            const shown = await notifications(command).handleRestartNotification();

            expect(shown).toBe(true);
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.markRestartNotificationShown'
            );
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                'Configuration saved. Restart the demo to apply changes.',
                'Restart Demo'
            );
        });

        it('stops THEN starts the demo, in that order', async () => {
            answerShouldShow({ [RESTART_SHOW]: true });
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Restart Demo');

            await notifications(command).handleRestartNotification();

            const ids = (vscode.commands.executeCommand as jest.Mock).mock.calls.map(
                ([id]) => id as string
            );
            expect(ids.indexOf('demoBuilder.stopDemo')).toBeGreaterThan(-1);
            expect(ids.indexOf('demoBuilder.startDemo')).toBeGreaterThan(
                ids.indexOf('demoBuilder.stopDemo')
            );
        });

        it('does not start the demo when the stop fails', async () => {
            answerShouldShow({ [RESTART_SHOW]: true });
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Restart Demo');
            (vscode.commands.executeCommand as jest.Mock).mockImplementation((id: string) => {
                if (id === RESTART_SHOW) return Promise.resolve(true);
                if (id === 'demoBuilder.stopDemo') return Promise.reject(new Error('stuck'));
                return Promise.resolve(undefined);
            });

            const shown = await notifications(command).handleRestartNotification();

            // Non-fatal: the prompt still counts as shown.
            expect(shown).toBe(true);
            const ids = (vscode.commands.executeCommand as jest.Mock).mock.calls.map(
                ([id]) => id as string
            );
            expect(ids).not.toContain('demoBuilder.startDemo');
        });

        it('does nothing when the prompt is dismissed', async () => {
            answerShouldShow({ [RESTART_SHOW]: true });
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

            await notifications(command).handleRestartNotification();

            const ids = (vscode.commands.executeCommand as jest.Mock).mock.calls.map(
                ([id]) => id as string
            );
            expect(ids).not.toContain('demoBuilder.stopDemo');
        });
    });

    // ── The auth guard around every "apply" ──────────────────────────────────

    describe('ensureAuthAndApply', () => {
        it('passes the project Adobe coordinates and the operation wording to the guard', async () => {
            mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
            stateManager.getCurrentProject.mockResolvedValue(
                createMockProject({
                    adobe: { organization: 'Acme', projectId: 'p1', workspace: 'Stage' },
                })
            );
            const operation = jest.fn().mockResolvedValue(undefined);

            const ok = await notifications(command).ensureAuthAndApply(operation, 'redeploy mesh');

            expect(ok).toBe(true);
            expect(operation).toHaveBeenCalledTimes(1);
            expect(mockEnsureAdobeIOAuth).toHaveBeenCalledWith(
                expect.objectContaining({
                    logPrefix: '[Configure]',
                    projectContext: {
                        organization: 'Acme',
                        projectId: 'p1',
                        workspace: 'Stage',
                    },
                    warningMessage: 'Adobe sign-in required to redeploy mesh.',
                })
            );
        });

        it('sends undefined coordinates rather than throwing when there is no project', async () => {
            mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
            stateManager.getCurrentProject.mockResolvedValue(undefined);

            await notifications(command).ensureAuthAndApply(
                jest.fn().mockResolvedValue(undefined),
                'apply changes'
            );

            expect(mockEnsureAdobeIOAuth).toHaveBeenCalledWith(
                expect.objectContaining({
                    projectContext: {
                        organization: undefined,
                        projectId: undefined,
                        workspace: undefined,
                    },
                })
            );
        });

        it('sends undefined coordinates for a project that has no Adobe block', async () => {
            mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
            stateManager.getCurrentProject.mockResolvedValue(
                createMockProject({ adobe: undefined })
            );

            await notifications(command).ensureAuthAndApply(
                jest.fn().mockResolvedValue(undefined),
                'apply changes'
            );

            expect(mockEnsureAdobeIOAuth).toHaveBeenCalledWith(
                expect.objectContaining({
                    projectContext: {
                        organization: undefined,
                        projectId: undefined,
                        workspace: undefined,
                    },
                })
            );
        });

        it('reports a failed sign-in and skips the operation', async () => {
            mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false, cancelled: false });
            const operation = jest.fn().mockResolvedValue(undefined);

            const ok = await notifications(command).ensureAuthAndApply(operation, 'redeploy mesh');

            expect(ok).toBe(false);
            expect(operation).not.toHaveBeenCalled();
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'Sign-in failed or was cancelled. Please try again.'
            );
        });

        it('stays silent when the user cancelled the sign-in themselves', async () => {
            mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false, cancelled: true });

            const ok = await notifications(command).ensureAuthAndApply(
                jest.fn().mockResolvedValue(undefined),
                'redeploy mesh'
            );

            expect(ok).toBe(false);
            expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        });

        it('returns false, without throwing, when the operation itself fails', async () => {
            mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });

            const ok = await notifications(command).ensureAuthAndApply(
                jest.fn().mockRejectedValue(new Error('deploy blew up')),
                'redeploy mesh'
            );

            expect(ok).toBe(false);
        });
    });

    // ── The Save-button lock ─────────────────────────────────────────────────

    describe('withDeploymentStatus', () => {
        it('brackets the operation with isDeploying true then false, and returns its value', async () => {
            const sendMessage = jest.fn().mockResolvedValue(undefined);
            notifications(command).communicationManager = { sendMessage };

            const value = await notifications(command).withDeploymentStatus(async () => 'done');

            expect(value).toBe('done');
            expect(sendMessage.mock.calls).toEqual([
                ['deployment-status', { isDeploying: true }],
                ['deployment-status', { isDeploying: false }],
            ]);
        });

        it('clears isDeploying even when the operation throws', async () => {
            const sendMessage = jest.fn().mockResolvedValue(undefined);
            notifications(command).communicationManager = { sendMessage };

            await expect(
                notifications(command).withDeploymentStatus(async () => {
                    throw new Error('boom');
                })
            ).rejects.toThrow('boom');

            expect(sendMessage).toHaveBeenLastCalledWith('deployment-status', {
                isDeploying: false,
            });
        });

        it('runs the operation with no webview attached', async () => {
            notifications(command).communicationManager = undefined;

            await expect(notifications(command).withDeploymentStatus(async () => 42)).resolves.toBe(
                42
            );
        });
    });
});
