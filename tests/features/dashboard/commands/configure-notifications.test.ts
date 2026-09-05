/**
 * ConfigureProjectWebviewCommand — post-save notification routing.
 *
 * After a save, exactly ONE contextual prompt is offered, chosen from what
 * actually changed: mesh + storefront (EDS), storefront alone (EDS), mesh alone,
 * or "the demo is running so restart it". Each prompt is once-per-session, and
 * each of its two answers has a durable consequence — "Apply" runs the real
 * operation behind an auth guard, "Later" records the decline on the project so
 * the dashboard shows it as update-declined rather than clean.
 *
 * These are the decisions no test reached: every assertion below names the
 * ARGUMENTS a collaborator receives (which command id, which project fields),
 * because the routing is entirely in what gets called with what.
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
const STOREFRONT_SHOW = 'demoBuilder._internal.shouldShowStorefrontNotification';

describe('ConfigureProjectWebviewCommand - post-save notifications', () => {
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

    // ── Routing: which of the four prompts, given what changed ───────────────

    describe('showPostSaveNotifications routing', () => {
        const YES = { hasChanges: true };
        const NO = { hasChanges: false };

        /** Replace the four handlers so routing is observable on its own. */
        function stubHandlers(shown: boolean): Record<string, jest.Mock> {
            const stubs = {
                handleCombinedMeshStorefrontNotification: jest.fn().mockResolvedValue(shown),
                handleStorefrontOnlyNotification: jest.fn().mockResolvedValue(shown),
                handleMeshOnlyNotification: jest.fn().mockResolvedValue(shown),
                handleRestartNotification: jest.fn().mockResolvedValue(shown),
            };
            Object.assign(command, stubs);
            return stubs;
        }

        it('refreshes the dashboard before deciding which prompt to show', async () => {
            stubHandlers(true);
            await notifications(command).showPostSaveNotifications(project, NO, NO);

            expect(mockRefreshStatus).toHaveBeenCalledTimes(1);
        });

        it('routes to the combined prompt when mesh AND storefront changed on EDS', async () => {
            const stubs = stubHandlers(true);
            await notifications(command).showPostSaveNotifications(project, YES, YES);

            expect(stubs.handleCombinedMeshStorefrontNotification).toHaveBeenCalledWith(project);
            expect(stubs.handleStorefrontOnlyNotification).not.toHaveBeenCalled();
            expect(stubs.handleMeshOnlyNotification).not.toHaveBeenCalled();
        });

        it('routes mesh+storefront to the MESH-ONLY prompt when the project is not EDS', async () => {
            mockIsEdsProject.mockReturnValue(false);
            const stubs = stubHandlers(true);
            await notifications(command).showPostSaveNotifications(project, YES, YES);

            expect(stubs.handleCombinedMeshStorefrontNotification).not.toHaveBeenCalled();
            expect(stubs.handleMeshOnlyNotification).toHaveBeenCalledWith(project);
        });

        it('routes to the storefront prompt when only storefront changed on EDS', async () => {
            const stubs = stubHandlers(true);
            await notifications(command).showPostSaveNotifications(project, NO, YES);

            expect(stubs.handleStorefrontOnlyNotification).toHaveBeenCalledWith(project);
            expect(stubs.handleMeshOnlyNotification).not.toHaveBeenCalled();
        });

        it('shows NO storefront prompt for a storefront change on a non-EDS project', async () => {
            mockIsEdsProject.mockReturnValue(false);
            const stubs = stubHandlers(true);
            const successSpy = jest
                .spyOn(
                    command as unknown as { showSuccessMessage: (m: string) => Promise<void> },
                    'showSuccessMessage'
                )
                .mockResolvedValue(undefined);

            await notifications(command).showPostSaveNotifications(project, NO, YES);

            expect(stubs.handleStorefrontOnlyNotification).not.toHaveBeenCalled();
            expect(successSpy).toHaveBeenCalledWith('Configuration saved successfully');
        });

        it('routes to the mesh prompt when only mesh changed', async () => {
            const stubs = stubHandlers(true);
            await notifications(command).showPostSaveNotifications(project, YES, NO);

            expect(stubs.handleMeshOnlyNotification).toHaveBeenCalledWith(project);
        });

        it('routes to the restart prompt when nothing changed but the demo is running', async () => {
            const stubs = stubHandlers(true);
            await notifications(command).showPostSaveNotifications(
                createMockProject({ status: 'running' }),
                NO,
                NO
            );

            expect(stubs.handleRestartNotification).toHaveBeenCalledTimes(1);
        });

        it('does NOT show the restart prompt when the demo is stopped', async () => {
            const stubs = stubHandlers(true);
            await notifications(command).showPostSaveNotifications(
                createMockProject({ status: 'stopped' }),
                NO,
                NO
            );

            expect(stubs.handleRestartNotification).not.toHaveBeenCalled();
        });

        it('falls back to the generic toast when the chosen prompt was suppressed', async () => {
            stubHandlers(false);
            const successSpy = jest
                .spyOn(
                    command as unknown as { showSuccessMessage: (m: string) => Promise<void> },
                    'showSuccessMessage'
                )
                .mockResolvedValue(undefined);

            await notifications(command).showPostSaveNotifications(project, YES, NO);

            expect(successSpy).toHaveBeenCalledWith('Configuration saved successfully');
        });

        it('suppresses the generic toast when the authoring experience changed', async () => {
            stubHandlers(false);
            const successSpy = jest
                .spyOn(
                    command as unknown as { showSuccessMessage: (m: string) => Promise<void> },
                    'showSuccessMessage'
                )
                .mockResolvedValue(undefined);

            await notifications(command).showPostSaveNotifications(project, NO, NO, true);

            expect(successSpy).not.toHaveBeenCalled();
        });
    });

    // ── Combined mesh + storefront prompt ────────────────────────────────────

    describe('combined mesh + storefront prompt', () => {
        it('suppresses itself when BOTH once-per-session flags are already spent', async () => {
            answerShouldShow({ [MESH_SHOW]: false, [STOREFRONT_SHOW]: false });

            const shown =
                await notifications(command).handleCombinedMeshStorefrontNotification(project);

            expect(shown).toBe(false);
            expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        });

        it('still prompts when only the mesh flag is unspent', async () => {
            answerShouldShow({ [MESH_SHOW]: true, [STOREFRONT_SHOW]: false });

            const shown =
                await notifications(command).handleCombinedMeshStorefrontNotification(project);

            expect(shown).toBe(true);
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                'Configuration saved. Apply changes to mesh and storefront?',
                'Apply Changes',
                'Later'
            );
        });

        it('marks BOTH flags spent so neither prompt repeats this session', async () => {
            answerShouldShow({ [MESH_SHOW]: true, [STOREFRONT_SHOW]: true });

            await notifications(command).handleCombinedMeshStorefrontNotification(project);

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.markMeshNotificationShown'
            );
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.markStorefrontNotificationShown'
            );
        });

        it('"Apply Changes" deploys the mesh and republishes the RE-READ project', async () => {
            answerShouldShow({ [MESH_SHOW]: true, [STOREFRONT_SHOW]: true });
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Apply Changes');
            mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
            const freshProject = createMockProject({ name: 'reloaded' });
            stateManager.getCurrentProject.mockResolvedValue(freshProject);
            const republish = jest.fn().mockResolvedValue(undefined);
            Object.assign(command, { republishStorefront: republish });

            await notifications(command).handleCombinedMeshStorefrontNotification(project);

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.deployMesh');
            // The RE-READ project, not the stale one the prompt was raised for:
            // deployMesh rewrites mesh state, so republishing the pre-deploy copy
            // would publish the config that was just superseded.
            expect(republish).toHaveBeenCalledWith(freshProject);
        });

        it('"Apply Changes" skips the republish when the project vanished mid-flight', async () => {
            answerShouldShow({ [MESH_SHOW]: true, [STOREFRONT_SHOW]: true });
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Apply Changes');
            mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
            stateManager.getCurrentProject.mockResolvedValue(undefined);
            const republish = jest.fn().mockResolvedValue(undefined);
            Object.assign(command, { republishStorefront: republish });

            await notifications(command).handleCombinedMeshStorefrontNotification(project);

            expect(republish).not.toHaveBeenCalled();
        });

        it('"Later" records the decline on BOTH the mesh entry and the storefront state', async () => {
            answerShouldShow({ [MESH_SHOW]: true, [STOREFRONT_SHOW]: true });
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Later');
            const declinable = createMockProject({
                edsStorefrontState: { envVars: {}, lastPublished: '2026-01-01T00:00:00.000Z', userDeclinedUpdate: false },
            });

            const shown =
                await notifications(command).handleCombinedMeshStorefrontNotification(declinable);

            expect(shown).toBe(true);
            expect(mockMarkMeshUpdateDeclined).toHaveBeenCalledWith(declinable);
            expect(declinable.edsStorefrontState?.userDeclinedUpdate).toBe(true);
            expect(declinable.edsStorefrontState?.declinedAt).toEqual(expect.any(String));
            expect(declinable.edsStorefrontStatusSummary).toBe('update-declined');
            expect(stateManager.saveProject).toHaveBeenCalledWith(declinable);
        });

        it('"Later" still saves and refreshes when there is no storefront state to mark', async () => {
            answerShouldShow({ [MESH_SHOW]: true, [STOREFRONT_SHOW]: true });
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Later');
            const noState = createMockProject({ edsStorefrontState: undefined });

            await notifications(command).handleCombinedMeshStorefrontNotification(noState);

            expect(noState.edsStorefrontStatusSummary).toBeUndefined();
            expect(stateManager.saveProject).toHaveBeenCalledWith(noState);
            expect(mockRefreshStatus).toHaveBeenCalled();
        });

        it('dismissing the prompt saves nothing', async () => {
            answerShouldShow({ [MESH_SHOW]: true, [STOREFRONT_SHOW]: true });
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);

            const shown =
                await notifications(command).handleCombinedMeshStorefrontNotification(project);

            expect(shown).toBe(true);
            expect(stateManager.saveProject).not.toHaveBeenCalled();
            expect(mockMarkMeshUpdateDeclined).not.toHaveBeenCalled();
        });
    });

    // ── Storefront-only prompt ───────────────────────────────────────────────

    describe('storefront-only prompt', () => {
        it('suppresses itself once the flag is spent', async () => {
            answerShouldShow({ [STOREFRONT_SHOW]: false });

            const shown = await notifications(command).handleStorefrontOnlyNotification(project);

            expect(shown).toBe(false);
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        });

        it('offers Republish/Later and spends the flag', async () => {
            answerShouldShow({ [STOREFRONT_SHOW]: true });

            const shown = await notifications(command).handleStorefrontOnlyNotification(project);

            expect(shown).toBe(true);
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.markStorefrontNotificationShown'
            );
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                'Configuration saved. Republish storefront to apply changes.',
                'Republish',
                'Later'
            );
        });

        it('"Republish" republishes THIS project behind the deploying flag', async () => {
            answerShouldShow({ [STOREFRONT_SHOW]: true });
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Republish');
            const republish = jest.fn().mockResolvedValue(undefined);
            Object.assign(command, { republishStorefront: republish });
            const sendMessage = jest.fn().mockResolvedValue(undefined);
            notifications(command).communicationManager = { sendMessage };

            await notifications(command).handleStorefrontOnlyNotification(project);

            expect(republish).toHaveBeenCalledWith(project);
            expect(sendMessage).toHaveBeenCalledWith('deployment-status', { isDeploying: true });
            expect(sendMessage).toHaveBeenLastCalledWith('deployment-status', {
                isDeploying: false,
            });
        });

        it('"Later" marks update-declined even with no storefront state object', async () => {
            answerShouldShow({ [STOREFRONT_SHOW]: true });
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Later');
            const noState = createMockProject({ edsStorefrontState: undefined });

            await notifications(command).handleStorefrontOnlyNotification(noState);

            // The summary is set OUTSIDE the state guard here — unlike the combined
            // flow — so the dashboard shows update-declined either way.
            expect(noState.edsStorefrontStatusSummary).toBe('update-declined');
            expect(stateManager.saveProject).toHaveBeenCalledWith(noState);
        });

        it('"Later" also flags the storefront state when one exists', async () => {
            answerShouldShow({ [STOREFRONT_SHOW]: true });
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Later');
            const withState = createMockProject({
                edsStorefrontState: { envVars: {}, lastPublished: '2026-01-01T00:00:00.000Z', userDeclinedUpdate: false },
            });

            await notifications(command).handleStorefrontOnlyNotification(withState);

            expect(withState.edsStorefrontState?.userDeclinedUpdate).toBe(true);
            expect(withState.edsStorefrontState?.declinedAt).toEqual(expect.any(String));
        });

        it('dismissing the prompt saves nothing', async () => {
            answerShouldShow({ [STOREFRONT_SHOW]: true });
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

            await notifications(command).handleStorefrontOnlyNotification(project);

            expect(stateManager.saveProject).not.toHaveBeenCalled();
        });
    });
});
