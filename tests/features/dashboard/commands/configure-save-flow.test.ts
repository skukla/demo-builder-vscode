/**
 * ConfigureProjectWebviewCommand — the save spine.
 *
 * One Save press does eight things in a fixed order, and most of them are only
 * observable in what a collaborator is HANDED: which configs reach the staleness
 * detectors (never the secrets), which project the rename re-keys secrets for,
 * which stale flags land on the manifest before it is written.
 *
 * The rename half matters most. The SecretStorage key is the project PATH, so a
 * rename orphans every migrated secret — the re-key has to run with the path as
 * it was BEFORE the rename and the path as it is after, and nothing but an
 * argument assertion can tell a correct re-key from a no-op one.
 */

import { ConfigureProjectWebviewCommand } from './configure.testUtils';
import * as vscode from 'vscode';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { COMPONENT_IDS } from '@/core/constants';
import { getAvailableAppBuilderComponents } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { reKeyProjectSecrets } from '@/features/components/services/commerceSecretMigration';
import { handleRenameProject } from '@/features/projects-dashboard/handlers/dashboardHandlers';
import { detectMeshChanges } from '@/features/mesh/services/stalenessDetector';
import { detectStorefrontChanges } from '@/features/eds/services/storefront/storefrontStalenessDetector';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { Logger } from '@/types/logger';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { internals } from '../../../helpers/commandInternals';

jest.mock('@/commands/handlerContextFactory', () => ({
    createPanelHandlerContext: jest.fn(() => ({ stub: 'handler-context' })),
}));

jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => ({
    getAvailableAppBuilderComponents: jest.fn(() => []),
}));

jest.mock('@/features/projects-dashboard/handlers/dashboardHandlers', () => ({
    handleRenameProject: jest.fn(async () => ({ success: true })),
}));

jest.mock('@/features/components/services/commerceSecretMigration', () => ({
    loadDeclaredSecretFlags: jest.fn(async () => ({})),
    migrateDeclaredSecrets: jest.fn(async (configs: unknown) => ({
        sanitizedConfigs: configs,
        moved: [],
        retained: [],
        cleared: [],
    })),
    reKeyProjectSecrets: jest.fn(async () => undefined),
}));

jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    detectMeshChanges: jest.fn(async () => ({ hasChanges: false })),
}));
jest.mock('@/features/eds/services/storefront/storefrontStalenessDetector', () => ({
    detectStorefrontChanges: jest.fn(() => ({ hasChanges: false })),
}));
jest.mock('@/features/eds/services/storefront/storefrontRepublishService', () => ({
    republishStorefrontConfig: jest.fn(async () => ({ success: true })),
}));
jest.mock('@/types/typeGuards', () => ({
    ...jest.requireActual('@/types/typeGuards'),
    isEdsProject: jest.fn(() => true),
}));
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getEwCanvasBranch: jest.fn(() => ''),
    resolveProjectAuthoringExperience: jest.fn(() => 'da-live-classic'),
}));
jest.mock('@/features/eds/handlers/edsServiceCache', () => ({
    getGitHubServices: jest.fn(() => ({ tokenService: { origin: 'shared-cache' } })),
}));

// The shared flip is exercised by its own suite; here it is the thing the command
// must CALL CORRECTLY, so the fake records the deps it was handed.
const mockApplyAuthoringExperienceFlip = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/eds/services/authoringExperienceFlip', () => ({
    applyAuthoringExperienceFlip: (...args: unknown[]) => mockApplyAuthoringExperienceFlip(...args),
}));

const mockSendAuthoringExperienceUpdate = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: {
        sendAuthoringExperienceUpdate: (...args: unknown[]) =>
            mockSendAuthoringExperienceUpdate(...args),
        refreshStatus: jest.fn().mockResolvedValue(undefined),
    },
}));

interface SaveInternals {
    handleSaveConfiguration(data: {
        componentConfigs: Record<string, Record<string, string>>;
        newProjectName?: string;
        authoringExperience?: string;
    }): Promise<unknown>;
    renameProjectIfRequested(project: Project, newName: string | undefined): Promise<Project>;
    applyAuthoringExperienceMetadata(project: Project, experience: string | undefined): boolean;
    applyAuthoringSideEffects(project: Project, experience: string): Promise<void>;
}

function save(command: ConfigureProjectWebviewCommand): SaveInternals {
    return command as unknown as SaveInternals;
}

/** An EDS project carrying a stored authoring experience. */
function edsProject(stored = 'da-live-classic', overrides: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'Test Project',
        path: '/test/project',
        selectedStack: 'eds-citisignal',
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                status: 'ready',
                metadata: {
                    daLiveOrg: 'my-org',
                    daLiveSite: 'my-site',
                    authoringExperience: stored,
                },
            },
        } as Project['componentInstances'],
        ...overrides,
    });
}

describe('ConfigureProjectWebviewCommand - save spine', () => {
    let command: ConfigureProjectWebviewCommand;
    let stateManager: ReturnType<typeof createMockStateManager>;
    let logger: Logger;

    beforeEach(() => {
        jest.clearAllMocks();
        // clearAllMocks forgets CALLS, not implementations — a `mockResolvedValue`
        // set inside one test is still in force in the next, which is how a
        // "nothing changed" case silently ran against "mesh changed".
        (detectMeshChanges as jest.Mock).mockResolvedValue({ hasChanges: false });
        (detectStorefrontChanges as jest.Mock).mockReturnValue({ hasChanges: false });
        (handleRenameProject as jest.Mock).mockResolvedValue({ success: true });
        mockApplyAuthoringExperienceFlip.mockResolvedValue(undefined);
        mockSendAuthoringExperienceUpdate.mockResolvedValue(undefined);
        (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue(undefined);
        ServiceLocator.setCommandExecutor(createMockCommandExecutor());
        ServiceLocator.setAuthenticationService(createMockAuthenticationService());

        stateManager = createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(edsProject()),
        });
        logger = createMockLogger() as unknown as Logger;
        command = new ConfigureProjectWebviewCommand(
            createMockExtensionContext(),
            stateManager,
            logger
        );
        // Only the IDENTITY of this object matters here — the flip is mocked, and
        // the assertion is which instance it was handed.
        command.githubTokenService = { origin: 'injected' } as unknown as NonNullable<
            typeof command.githubTokenService
        >;
        internals(command).registerProgrammaticWrites = jest.fn().mockResolvedValue(undefined);
        internals(command).regenerateEnvFiles = jest.fn().mockResolvedValue(undefined);
        internals(command).showPostSaveNotifications = jest.fn().mockResolvedValue(undefined);
    });

    describe('handleSaveConfiguration', () => {
        it('returns a coded failure — not a throw — when there is no project', async () => {
            stateManager.getCurrentProject.mockResolvedValue(undefined);

            const result = await save(command).handleSaveConfiguration({ componentConfigs: {} });

            expect(result).toEqual({
                success: false,
                error: 'No project found',
                code: ErrorCode.CONFIG_INVALID,
            });
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'Failed to save configuration: No project found'
            );
        });

        it('surfaces a persistence failure with the underlying message', async () => {
            stateManager.saveProject.mockRejectedValue(new Error('disk full'));

            const result = await save(command).handleSaveConfiguration({ componentConfigs: {} });

            expect(result).toEqual({
                success: false,
                error: 'disk full',
                code: ErrorCode.CONFIG_INVALID,
            });
        });

        it('hands the SANITIZED configs to the mesh detector, inside the project org context', async () => {
            const project = edsProject('da-live-classic', {
                adobe: { organization: 'Acme', projectId: 'p1', workspace: 'Stage' },
            });
            stateManager.getCurrentProject.mockResolvedValue(project);

            await save(command).handleSaveConfiguration({
                componentConfigs: { mesh: { MESH_KEY: 'v' } },
            });

            expect(detectMeshChanges).toHaveBeenCalledWith(
                project,
                { mesh: { MESH_KEY: 'v' } },
                expect.objectContaining({
                    commandManager: expect.anything(),
                    authManager: expect.anything(),
                })
            );
        });

        it('reads the App Builder catalog for the project own stack ids', async () => {
            stateManager.getCurrentProject.mockResolvedValue(
                edsProject('da-live-classic', {
                    componentSelections: { backend: 'accs', frontend: 'eds-storefront' },
                })
            );

            await save(command).handleSaveConfiguration({ componentConfigs: {} });

            // The catalog decides which keys count as secrets, so the wrong stack
            // ids here mean a secret is written into the manifest in clear.
            expect(getAvailableAppBuilderComponents).toHaveBeenCalledWith(
                'accs',
                'eds-storefront'
            );
        });

        it('reads the catalog with empty ids when the project has no selections', async () => {
            stateManager.getCurrentProject.mockResolvedValue(
                edsProject('da-live-classic', { componentSelections: undefined })
            );

            await save(command).handleSaveConfiguration({ componentConfigs: {} });

            expect(getAvailableAppBuilderComponents).toHaveBeenCalledWith('', '');
        });

        it('hands the same configs to the storefront detector', async () => {
            const project = edsProject();
            stateManager.getCurrentProject.mockResolvedValue(project);

            await save(command).handleSaveConfiguration({
                componentConfigs: { eds: { STORE_VIEW: 'main' } },
            });

            expect(detectStorefrontChanges).toHaveBeenCalledWith(project, {
                eds: { STORE_VIEW: 'main' },
            });
        });

        it('writes the edited configs onto the project it saves', async () => {
            const project = edsProject();
            stateManager.getCurrentProject.mockResolvedValue(project);

            await save(command).handleSaveConfiguration({
                componentConfigs: { mesh: { A: '1' } },
            });

            expect(stateManager.saveProject).toHaveBeenCalledWith(project);
            expect(project.componentConfigs).toEqual({ mesh: { A: '1' } });
        });

        it('marks the mesh stale — and only the mesh — when the mesh config changed', async () => {
            (detectMeshChanges as jest.Mock).mockResolvedValue({ hasChanges: true });
            const project = edsProject();
            stateManager.getCurrentProject.mockResolvedValue(project);

            await save(command).handleSaveConfiguration({ componentConfigs: {} });

            expect(project.meshStatusSummary).toBe('stale');
            expect(project.edsStorefrontStatusSummary).toBeUndefined();
        });

        it('marks the storefront stale — and only the storefront — when its config changed', async () => {
            (detectStorefrontChanges as jest.Mock).mockReturnValue({ hasChanges: true });
            const project = edsProject();
            stateManager.getCurrentProject.mockResolvedValue(project);

            await save(command).handleSaveConfiguration({ componentConfigs: {} });

            expect(project.edsStorefrontStatusSummary).toBe('stale');
            expect(project.meshStatusSummary).toBeUndefined();
        });

        it('re-arms the apply prompts when anything went stale', async () => {
            (detectStorefrontChanges as jest.Mock).mockReturnValue({ hasChanges: true });

            await save(command).handleSaveConfiguration({ componentConfigs: {} });

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.configChanged'
            );
        });

        it('leaves the prompts as they are when nothing went stale', async () => {
            await save(command).handleSaveConfiguration({ componentConfigs: {} });

            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
                'demoBuilder._internal.configChanged'
            );
        });

        it('registers the programmatic writes BEFORE regenerating the files', async () => {
            const order: string[] = [];
            internals(command).registerProgrammaticWrites = jest.fn(async () => {
                order.push('register');
            });
            internals(command).regenerateEnvFiles = jest.fn(async () => {
                order.push('regenerate');
            });

            await save(command).handleSaveConfiguration({
                componentConfigs: { mesh: { A: '1' } },
            });

            expect(order).toEqual(['register', 'regenerate']);
            expect(internals(command).registerProgrammaticWrites).toHaveBeenCalledWith(
                expect.anything(),
                { mesh: { A: '1' } }
            );
        });

        it('reports what changed to the post-save notifier', async () => {
            (detectMeshChanges as jest.Mock).mockResolvedValue({ hasChanges: true });
            (detectStorefrontChanges as jest.Mock).mockReturnValue({ hasChanges: false });
            const project = edsProject();
            stateManager.getCurrentProject.mockResolvedValue(project);

            await save(command).handleSaveConfiguration({ componentConfigs: {} });
            await new Promise<void>((resolve) => setImmediate(resolve));

            expect(internals(command).showPostSaveNotifications).toHaveBeenCalledWith(
                project,
                { hasChanges: true },
                { hasChanges: false },
                false
            );
        });

        it('tells the notifier the authoring experience changed, so it stays quiet', async () => {
            stateManager.getCurrentProject.mockResolvedValue(edsProject('da-live-classic'));

            await save(command).handleSaveConfiguration({
                componentConfigs: {},
                authoringExperience: 'experience-workspace',
            });
            await new Promise<void>((resolve) => setImmediate(resolve));

            expect(internals(command).showPostSaveNotifications).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.anything(),
                true
            );
        });

        it('still saves when pushing the new DA URL to the dashboard fails', async () => {
            mockSendAuthoringExperienceUpdate.mockRejectedValueOnce(new Error('no dashboard'));
            stateManager.getCurrentProject.mockResolvedValue(edsProject('da-live-classic'));

            const result = await save(command).handleSaveConfiguration({
                componentConfigs: {},
                authoringExperience: 'experience-workspace',
            });

            expect(result).toEqual({ success: true });
            expect(stateManager.saveProject).toHaveBeenCalled();
        });
    });

    describe('renameProjectIfRequested', () => {
        it('does nothing when no new name was sent', async () => {
            const project = edsProject();

            await expect(save(command).renameProjectIfRequested(project, undefined)).resolves.toBe(
                project
            );
            expect(handleRenameProject).not.toHaveBeenCalled();
        });

        it('does nothing when the "new" name is the name it already has', async () => {
            const project = edsProject();

            await expect(
                save(command).renameProjectIfRequested(project, 'Test Project')
            ).resolves.toBe(project);
            expect(handleRenameProject).not.toHaveBeenCalled();
        });

        it('renames by PATH, then re-keys the secrets from the old path to the new one', async () => {
            const renamed = createMockProject({
                name: 'Renamed',
                path: '/test/renamed',
                componentConfigs: { 'commerce-accs': {}, mesh: {} },
            });
            stateManager.getCurrentProject.mockResolvedValue(renamed);

            const result = await save(command).renameProjectIfRequested(edsProject(), 'Renamed');

            expect(result).toBe(renamed);
            expect(handleRenameProject).toHaveBeenCalledWith(expect.anything(), {
                projectPath: '/test/project',
                newName: 'Renamed',
            });
            // The path BEFORE the rename first — reversing these silently orphans
            // every already-migrated secret, and the field then just reads blank.
            expect(reKeyProjectSecrets).toHaveBeenCalledWith(
                '/test/project',
                '/test/renamed',
                ['commerce-accs', 'mesh'],
                expect.anything(),
                expect.any(Function)
            );
        });

        it('re-keys nothing when the renamed project has no componentConfigs', async () => {
            stateManager.getCurrentProject.mockResolvedValue(
                createMockProject({ path: '/test/renamed', componentConfigs: undefined })
            );

            await save(command).renameProjectIfRequested(edsProject(), 'Renamed');

            expect(reKeyProjectSecrets).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                [],
                expect.anything(),
                expect.any(Function)
            );
        });

        it('aborts the save with the rename error the handler reported', async () => {
            (handleRenameProject as jest.Mock).mockResolvedValue({
                success: false,
                error: 'A project called Renamed already exists',
            });

            await expect(
                save(command).renameProjectIfRequested(edsProject(), 'Renamed')
            ).rejects.toThrow('A project called Renamed already exists');
            expect(reKeyProjectSecrets).not.toHaveBeenCalled();
        });

        it('aborts with a generic message when the rename failed without saying why', async () => {
            (handleRenameProject as jest.Mock).mockResolvedValue({ success: false });

            await expect(
                save(command).renameProjectIfRequested(edsProject(), 'Renamed')
            ).rejects.toThrow('Failed to rename project');
        });

        it('aborts when the renamed project cannot be read back', async () => {
            stateManager.getCurrentProject.mockResolvedValue(undefined);

            await expect(
                save(command).renameProjectIfRequested(edsProject(), 'Renamed')
            ).rejects.toThrow('Project not found after rename');
            expect(reKeyProjectSecrets).not.toHaveBeenCalled();
        });
    });

    describe('applyAuthoringExperienceMetadata', () => {
        it('records a changed experience on the EDS instance and reports the change', () => {
            const project = edsProject('da-live-classic');

            const changed = save(command).applyAuthoringExperienceMetadata(
                project,
                'experience-workspace'
            );

            expect(changed).toBe(true);
            expect(project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata).toEqual({
                daLiveOrg: 'my-org',
                daLiveSite: 'my-site',
                authoringExperience: 'experience-workspace',
            });
        });

        it('reports no change when the stored experience already matches', () => {
            const project = edsProject('experience-workspace');

            expect(
                save(command).applyAuthoringExperienceMetadata(project, 'experience-workspace')
            ).toBe(false);
        });

        it('ignores a save that carries no experience at all', () => {
            const project = edsProject('da-live-classic');

            expect(save(command).applyAuthoringExperienceMetadata(project, undefined)).toBe(false);
            expect(
                project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata
                    ?.authoringExperience
            ).toBe('da-live-classic');
        });

        it('refuses an experience that is not one of the two this extension ships', () => {
            const project = edsProject('da-live-classic');

            expect(save(command).applyAuthoringExperienceMetadata(project, 'sharepoint')).toBe(
                false
            );
        });

        it('refuses a non-EDS project', () => {
            const typeGuards = jest.requireMock('@/types/typeGuards') as {
                isEdsProject: jest.Mock;
            };
            typeGuards.isEdsProject.mockReturnValueOnce(false);

            expect(
                save(command).applyAuthoringExperienceMetadata(edsProject(), 'experience-workspace')
            ).toBe(false);
        });

        it('reports no change when the EDS instance is missing from the manifest', () => {
            const project = createMockProject({ componentInstances: {} });

            expect(
                save(command).applyAuthoringExperienceMetadata(project, 'experience-workspace')
            ).toBe(false);
        });

        it('reports no change for a project with no component instances at all', () => {
            const project = createMockProject({ componentInstances: undefined });

            expect(
                save(command).applyAuthoringExperienceMetadata(project, 'experience-workspace')
            ).toBe(false);
        });

        it('records the first experience a project has ever had', () => {
            const project = createMockProject({
                componentInstances: {
                    [COMPONENT_IDS.EDS_STOREFRONT]: {
                        id: COMPONENT_IDS.EDS_STOREFRONT,
                        name: 'EDS Storefront',
                        status: 'ready',
                    },
                } as Project['componentInstances'],
            });

            expect(save(command).applyAuthoringExperienceMetadata(project, 'da-live-classic')).toBe(
                true
            );
            expect(
                project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata
                    ?.authoringExperience
            ).toBe('da-live-classic');
        });
    });

    describe('applyAuthoringSideEffects', () => {
        it('narrates the Quick Edit step only when flipping to Experience Workspace', async () => {
            const report = jest.fn();
            (vscode.window.withProgress as jest.Mock).mockImplementation(
                async (_o: unknown, task: (p: { report: jest.Mock }) => Promise<unknown>) =>
                    task({ report })
            );

            await save(command).applyAuthoringSideEffects(edsProject(), 'experience-workspace');
            const ewMessages = report.mock.calls.map(([m]) => (m as { message: string }).message);

            report.mockClear();
            await save(command).applyAuthoringSideEffects(edsProject(), 'da-live-classic');
            const classicMessages = report.mock.calls.map(
                ([m]) => (m as { message: string }).message
            );

            expect(vscode.window.withProgress).toHaveBeenCalledWith(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Switching author mode',
                    // Not cancellable: half-applying an authoring flip leaves the
                    // storefront pointing at an editor that is no longer configured.
                    cancellable: false,
                },
                expect.any(Function)
            );
            expect(ewMessages).toEqual([
                'Updating the DA.live editor link…',
                'Adding Quick Edit to the storefront…',
            ]);
            expect(classicMessages).toEqual(['Updating the DA.live editor link…']);
        });

        it('gives the flip the INJECTED GitHub token service when the command has one', async () => {
            await save(command).applyAuthoringSideEffects(edsProject(), 'da-live-classic');

            expect(mockApplyAuthoringExperienceFlip).toHaveBeenCalledWith(
                expect.anything(),
                'da-live-classic',
                expect.objectContaining({ githubTokenService: { origin: 'injected' } })
            );
        });

        it('falls back to the SHARED GitHub services when no seam was set', async () => {
            command.githubTokenService = undefined;

            await save(command).applyAuthoringSideEffects(edsProject(), 'da-live-classic');

            expect(mockApplyAuthoringExperienceFlip).toHaveBeenCalledWith(
                expect.anything(),
                'da-live-classic',
                expect.objectContaining({ githubTokenService: { origin: 'shared-cache' } })
            );
        });

        it('gives the flip a save seam that persists through THIS command state manager', async () => {
            const project = edsProject();
            mockApplyAuthoringExperienceFlip.mockImplementationOnce(
                async (_p: Project, _e: string, deps: { saveProject: (p: Project) => unknown }) => {
                    await deps.saveProject(project);
                }
            );

            await save(command).applyAuthoringSideEffects(project, 'da-live-classic');

            expect(stateManager.saveProject).toHaveBeenCalledWith(project);
        });
    });
});
