/**
 * CheckUpdatesCommand — the check phase, decision by decision.
 *
 * What the command hands its collaborators (the progress bar, the project
 * loader, the update manager, the picker) and what it decides from their
 * answers: which sources count as "an update", when the extension prompt
 * appears and what it short-circuits, how fork/add-on/MCP results become
 * picker items. The executors are mocked so a selection is observable as the
 * arguments they receive rather than as their side effects.
 */

import {
    AddonUpdateChecker,
    CheckUpdatesCommand,
    ForkSyncService,
    TemplateUpdateChecker,
    UpdateManager,
    loadProjects,
    projectWithAddons,
    setupDefaultMocks,
} from './checkUpdates.testUtils';
import * as vscode from 'vscode';
import { OPERATION_STAGES as S } from '@/core/utils/operationStages';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { performForkSyncUpdates } from '@/features/updates/commands/updateExecutor';
import { AdobeMcpUpdateChecker } from '@/features/updates/services/adobeMcpUpdateChecker';
import { ExtensionUpdater } from '@/features/updates/services/extensionUpdater';
import type { UpdateItem } from '@/features/updates/commands/updateTypes';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

jest.mock('@/features/updates/commands/updateExecutor');
jest.mock('@/features/updates/services/adobeMcpUpdateChecker');
jest.mock('@/core/utils/sleep');

const showQuickPickMock = vscode.window.showQuickPick as jest.Mock;
const showInfoMock = vscode.window.showInformationMessage as jest.Mock;
const showErrorMock = vscode.window.showErrorMessage as jest.Mock;
const withProgressMock = vscode.window.withProgress as jest.Mock;
const MockUpdateManager = UpdateManager as jest.MockedClass<typeof UpdateManager>;
const MockForkSync = ForkSyncService as jest.MockedClass<typeof ForkSyncService>;
const MockAddonChecker = AddonUpdateChecker as jest.MockedClass<typeof AddonUpdateChecker>;
const MockTemplateChecker = TemplateUpdateChecker as jest.MockedClass<typeof TemplateUpdateChecker>;
const MockMcpChecker = AdobeMcpUpdateChecker as jest.MockedClass<typeof AdobeMcpUpdateChecker>;
const MockExtensionUpdater = ExtensionUpdater as jest.MockedClass<typeof ExtensionUpdater>;

const RELEASE = {
    version: '2.0.0',
    downloadUrl: 'https://example.com/ext-2.0.0.vsix',
    releaseNotes: '',
    publishedAt: '',
    isPrerelease: false,
};

function pickerItems(): UpdateItem[] {
    return showQuickPickMock.mock.calls[0][0];
}

function extensionUpdate(overrides: Partial<{ hasUpdate: boolean; releaseInfo?: typeof RELEASE }> = {}) {
    MockUpdateManager.prototype.checkExtensionUpdate = jest.fn().mockResolvedValue({
        hasUpdate: true,
        current: '1.0.0',
        latest: '2.0.0',
        releaseInfo: RELEASE,
        ...overrides,
    });
}

function componentUpdateFor(project: ReturnType<typeof projectWithAddons>) {
    MockUpdateManager.prototype.checkAllProjectsForUpdates = jest.fn().mockResolvedValue([
        {
            componentId: 'eds-storefront',
            latestVersion: '2.0.0',
            releaseInfo: RELEASE,
            outdatedProjects: [{ project, currentVersion: '1.0.0' }],
        },
    ]);
}

function templateUpdateFor() {
    MockTemplateChecker.prototype.checkForUpdates.mockResolvedValue({
        hasUpdates: true,
        currentCommit: 'old',
        latestCommit: 'new',
        commitsBehind: 2,
        templateOwner: 'adobe',
        templateRepo: 'aem-boilerplate-commerce',
    });
}

function forkBehind(overrides: Partial<{ defaultBranch?: string; parentFullName?: string }> = {}) {
    MockForkSync.prototype.checkForkStatus.mockResolvedValue({
        isFork: true,
        behindBy: 3,
        parentFullName: 'adobe/aem-boilerplate-commerce',
        defaultBranch: 'main',
        ...overrides,
    });
}

function blockLibraryUpdateFor(project: ReturnType<typeof projectWithAddons>) {
    MockAddonChecker.prototype.checkBlockLibraries.mockResolvedValue([
        { library: project.installedBlockLibraries![0], latestCommit: 'lib-new', commitsBehind: 1 },
    ]);
}

function mcpUpdate() {
    MockMcpChecker.prototype.checkForUpdates = jest.fn().mockResolvedValue({
        hasUpdate: true,
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        packageName: '@adobe-commerce/commerce-extensibility-tools',
    });
}

describe('CheckUpdatesCommand — check phase', () => {
    let harness: ReturnType<typeof setupDefaultMocks>;
    let command: CheckUpdatesCommand;

    beforeEach(() => {
        jest.clearAllMocks();
        ServiceLocator.setCommandExecutor(createMockCommandExecutor());
        harness = setupDefaultMocks();
        MockMcpChecker.prototype.checkForUpdates = jest.fn().mockResolvedValue(null);
        MockUpdateManager.prototype.getLatestFinalVersion = jest.fn().mockResolvedValue(null);
        MockExtensionUpdater.prototype.updateExtension = jest.fn().mockResolvedValue(undefined);
        showQuickPickMock.mockResolvedValue([]);
        command = new CheckUpdatesCommand(harness.mockContext, harness.mockStateManager, harness.mockLogger);
    });

    describe('shell', () => {
        it('a second execute while one is in flight is a no-op', async () => {
            const first = command.execute();
            const second = command.execute();
            await Promise.all([first, second]);

            // One check ran (its outcome notification is a second withProgress call).
            const checks = withProgressMock.mock.calls.filter(([options]) => options.title === 'Checking for updates');
            expect(checks).toHaveLength(1);
        });

        it('runs under a non-cancellable notification titled Checking for updates', async () => {
            await command.execute();

            expect(withProgressMock).toHaveBeenCalledWith(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Checking for updates',
                    cancellable: false,
                },
                expect.any(Function),
            );
        });

        // Each phase a step from the stage table, numbered from the fixed list (progress
        // vocabulary slice 7, owner 2026-10-16). The first one said the title again.
        it('reports each phase to the progress bar as a numbered step, in order', async () => {
            await command.execute();

            const messages = harness.mockProgress.report.mock.calls.map(([p]) => p.message);
            expect(messages.slice(0, 8)).toEqual([
                `${S.checkingExtension.label} (1 of 8)`,
                `${S.checkingAllProjects.label} (2 of 8)`,
                `${S.checkingSourceRepos.label} (3 of 8)`,
                // Phase 3 ran across every project and said nothing (slice 9).
                `${S.checkingComponents.label} (4 of 8)`,
                `${S.checkingTemplates.label} (5 of 8)`,
                `${S.checkingAddOns.label} (6 of 8)`,
                `${S.checkingAiTools.label} (7 of 8)`,
                `${S.checkingIntegrations.label} (8 of 8)`,
            ]);
        });

        it('leaves the graduation off-ramp out of the failure path', async () => {
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
                get: jest.fn((key: string, def: unknown) => (key === 'updateChannel' ? 'early-access' : def)),
            });
            MockUpdateManager.prototype.getLatestFinalVersion = jest
                .fn()
                .mockRejectedValue(new Error('GitHub down'));
            const project = projectWithAddons();
            loadProjects(harness.mockStateManager, project);
            blockLibraryUpdateFor(project);

            await command.execute();

            expect(showErrorMock).not.toHaveBeenCalled();
            expect(showQuickPickMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('loading projects', () => {
        it('loads each listed project without persisting, and skips one that fails to load', async () => {
            const project = projectWithAddons();
            harness.mockStateManager.getAllProjects.mockResolvedValue([
                { name: project.name, path: project.path, lastModified: new Date() },
                { name: 'ghost', path: '/projects/ghost', lastModified: new Date() },
            ]);
            harness.mockStateManager.loadProjectFromPath.mockImplementation(async (path: string) =>
                path === project.path ? project : null,
            );

            await command.execute();

            expect(harness.mockStateManager.loadProjectFromPath).toHaveBeenCalledWith(
                '/projects/ghost',
                undefined,
                { persistAfterLoad: false },
            );
            expect(MockUpdateManager.prototype.checkAllProjectsForUpdates).toHaveBeenCalledWith([project]);
            expect(showErrorMock).not.toHaveBeenCalled();
        });

        it('does not ask the update manager about components when no project loaded', async () => {
            await command.execute();

            expect(MockUpdateManager.prototype.checkAllProjectsForUpdates).not.toHaveBeenCalled();
        });
    });

    describe('what counts as an update', () => {
        it('nothing: says up to date with the version as the outcome, logs once, opens no picker', async () => {
            await command.execute();

            // A result, not a step: the outcome notification after the run, never a
            // progress line (progress vocabulary slice 8).
            expect(harness.mockProgress.report).not.toHaveBeenCalledWith({
                message: expect.stringContaining('Up to date'),
            });
            expect(withProgressMock).toHaveBeenLastCalledWith(
                expect.objectContaining({ title: 'Demo Builder is up to date (v1.0.0)' }),
                expect.any(Function),
            );
            expect(harness.mockLogger.info).toHaveBeenCalledTimes(1);
            expect(showQuickPickMock).not.toHaveBeenCalled();
            expect(showInfoMock).not.toHaveBeenCalled();
        });

        it.each([
            ['a component update', (p: ReturnType<typeof projectWithAddons>) => componentUpdateFor(p)],
            ['a template update', () => templateUpdateFor()],
            ['an Adobe MCP update', () => mcpUpdate()],
        ])('%s alone opens the picker and skips the Up to date hold', async (_label, arrange) => {
            const project = projectWithAddons();
            loadProjects(harness.mockStateManager, project);
            arrange(project);

            await command.execute();

            expect(showQuickPickMock).toHaveBeenCalledTimes(1);
            expect(pickerItems()).toHaveLength(1);
            expect(withProgressMock).not.toHaveBeenCalledWith(
                expect.objectContaining({ title: expect.stringContaining('up to date') }),
                expect.any(Function),
            );
        });
    });

    describe('extension update', () => {
        it('is not offered when there is none', async () => {
            const project = projectWithAddons();
            loadProjects(harness.mockStateManager, project);
            blockLibraryUpdateFor(project);

            await command.execute();

            expect(showInfoMock).not.toHaveBeenCalled();
        });

        it('alone: prompts with the versions, and Later opens no picker', async () => {
            extensionUpdate();
            showInfoMock.mockResolvedValue('Later');

            await command.execute();

            expect(showInfoMock).toHaveBeenCalledWith(
                'Extension update available: v1.0.0 → v2.0.0',
                'Update Extension',
                'Later',
            );
            expect(MockExtensionUpdater.prototype.updateExtension).not.toHaveBeenCalled();
            expect(showQuickPickMock).not.toHaveBeenCalled();
        });

        it('Update Extension: installs the release and stops before the picker', async () => {
            extensionUpdate();
            showInfoMock.mockResolvedValue('Update Extension');
            const project = projectWithAddons();
            loadProjects(harness.mockStateManager, project);
            blockLibraryUpdateFor(project);

            await command.execute();

            expect(MockExtensionUpdater.prototype.updateExtension).toHaveBeenCalledWith(
                RELEASE.downloadUrl,
                '2.0.0',
            );
            expect(showQuickPickMock).not.toHaveBeenCalled();
        });

        it('Later with other updates pending: no install, picker opens', async () => {
            extensionUpdate();
            showInfoMock.mockResolvedValue('Later');
            const project = projectWithAddons();
            loadProjects(harness.mockStateManager, project);
            blockLibraryUpdateFor(project);

            await command.execute();

            expect(MockExtensionUpdater.prototype.updateExtension).not.toHaveBeenCalled();
            expect(showQuickPickMock).toHaveBeenCalledTimes(1);
        });

        it('Update Extension without release info: nothing to install, picker opens', async () => {
            extensionUpdate({ releaseInfo: undefined });
            showInfoMock.mockResolvedValue('Update Extension');
            const project = projectWithAddons();
            loadProjects(harness.mockStateManager, project);
            blockLibraryUpdateFor(project);

            await command.execute();

            expect(MockExtensionUpdater.prototype.updateExtension).not.toHaveBeenCalled();
            expect(showQuickPickMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('picker', () => {
        it('is a multi-select that survives focus loss, titled with the summary', async () => {
            const project = projectWithAddons();
            loadProjects(harness.mockStateManager, project);
            blockLibraryUpdateFor(project);

            await command.execute();

            expect(showQuickPickMock).toHaveBeenCalledWith(expect.any(Array), {
                title: 'Updates Available (1 project, 1 add-on)',
                placeHolder: 'Select updates to apply',
                canPickMany: true,
                ignoreFocusOut: true,
            });
        });

        it.each([
            ['dismissed', undefined],
            ['confirmed with nothing ticked', []],
        ])('%s: dispatches nothing and raises no error', async (_label, selection) => {
            const project = projectWithAddons();
            loadProjects(harness.mockStateManager, project);
            forkBehind();
            showQuickPickMock.mockResolvedValue(selection);

            const buildContext = jest.spyOn(ServiceLocator, 'getCommandExecutor');

            await command.execute();

            expect(performForkSyncUpdates).not.toHaveBeenCalled();
            expect(buildContext).not.toHaveBeenCalled();
            expect(showErrorMock).not.toHaveBeenCalled();
        });

        it('marks items for the current project as current and pre-ticked', async () => {
            const current = projectWithAddons();
            const other = projectWithAddons({ name: 'other', path: '/projects/other' });
            loadProjects(harness.mockStateManager, current, other);
            harness.mockStateManager.getCurrentProject.mockResolvedValue(current);
            componentUpdateFor(current);
            MockAddonChecker.prototype.checkBlockLibraries.mockImplementation(async (p) => [
                { library: p.installedBlockLibraries![0], latestCommit: 'lib-new', commitsBehind: 1 },
            ]);
            MockAddonChecker.prototype.checkInspectorSdk.mockResolvedValue({
                hasUpdate: true,
                currentCommit: 'a',
                latestCommit: 'b',
                commitsBehind: 1,
            });
            mcpUpdate();

            await command.execute();

            const items = pickerItems();
            const forProject = (path: string, key: string) =>
                items.filter((i) => key in i && (i as { project: { path: string } }).project.path === path);
            expect(forProject(current.path, 'isProjectUpdate')[0]).toMatchObject({
                label: 'test-project (current)',
                picked: true,
            });
            expect(forProject(current.path, 'isBlockLibraryUpdate')[0]).toMatchObject({ picked: true });
            expect(forProject(other.path, 'isBlockLibraryUpdate')[0]).toMatchObject({ picked: false });
            expect(forProject(current.path, 'isInspectorUpdate')[0]).toMatchObject({ picked: true });
            expect(forProject(other.path, 'isInspectorUpdate')[0]).toMatchObject({ picked: false });
            expect(forProject(current.path, 'isAdobeMcpUpdate')[0]).toMatchObject({
                label: 'test-project (current)',
                picked: true,
            });
            expect(forProject(other.path, 'isAdobeMcpUpdate')[0]).toMatchObject({ label: 'other', picked: false });
        });
    });

    describe('fork sync items', () => {
        it('one behind-upstream fork becomes a pre-ticked item carrying the branch and parent', async () => {
            loadProjects(harness.mockStateManager, projectWithAddons());
            forkBehind({ defaultBranch: 'develop' });

            await command.execute();

            expect(pickerItems()[0]).toMatchObject({
                label: '$(repo-forked) aem-boilerplate-commerce',
                detail: '    3 commits behind adobe/aem-boilerplate-commerce',
                description: 'adobe/aem-boilerplate-commerce',
                isForkSync: true,
                picked: true,
                owner: 'adobe',
                repo: 'aem-boilerplate-commerce',
                branch: 'develop',
                behindBy: 3,
                parentFullName: 'adobe/aem-boilerplate-commerce',
            });
        });

        it('falls back to main and an empty parent when the status omits them', async () => {
            loadProjects(harness.mockStateManager, projectWithAddons());
            forkBehind({ defaultBranch: undefined, parentFullName: undefined });

            await command.execute();

            expect(pickerItems()[0]).toMatchObject({ branch: 'main', parentFullName: '' });
        });

        it('checks each source repo once, and not at all for a project without a template source', async () => {
            const a = projectWithAddons({ name: 'a', path: '/projects/a' });
            const b = projectWithAddons({ name: 'b', path: '/projects/b' });
            const noSource = projectWithAddons({
                name: 'c',
                path: '/projects/c',
                componentInstances: {},
            });
            loadProjects(harness.mockStateManager, a, b, noSource);
            forkBehind();

            await command.execute();

            expect(MockForkSync.prototype.checkForkStatus).toHaveBeenCalledTimes(1);
            expect(MockForkSync.prototype.checkForkStatus).toHaveBeenCalledWith('adobe', 'aem-boilerplate-commerce');
            expect(showErrorMock).not.toHaveBeenCalled();
            expect(pickerItems()).toHaveLength(1);
        });

        it('checks two different source repos separately: the once-only rule is per owner and repo', async () => {
            const withSource = (name: string, templateRepo: string) => {
                const project = projectWithAddons({ name, path: `/projects/${name}` });
                const eds = project.componentInstances!['eds-storefront'];
                eds.metadata = { ...eds.metadata, templateRepo };
                return project;
            };
            loadProjects(harness.mockStateManager, withSource('a', 'boilerplate-one'), withSource('b', 'boilerplate-two'));

            await command.execute();

            expect(MockForkSync.prototype.checkForkStatus.mock.calls).toEqual([
                ['adobe', 'boilerplate-one'],
                ['adobe', 'boilerplate-two'],
            ]);
        });
    });

    describe('add-on items', () => {
        it('a block library and the inspector SDK each read as the project, with what is behind', async () => {
            const project = projectWithAddons();
            loadProjects(harness.mockStateManager, project);
            blockLibraryUpdateFor(project);
            MockAddonChecker.prototype.checkInspectorSdk.mockResolvedValue({
                hasUpdate: true,
                currentCommit: 'a',
                latestCommit: 'b',
                commitsBehind: 2,
            });

            await command.execute();

            const items = pickerItems();
            expect(items.find((i) => 'isBlockLibraryUpdate' in i)).toMatchObject({
                label: 'test-project',
                detail: '    $(package) Demo Team Blocks  1 commit behind',
            });
            expect(items.find((i) => 'isInspectorUpdate' in i)).toMatchObject({
                label: 'test-project',
                detail: '    $(tools) Demo Inspector SDK  2 commits behind',
            });
        });
    });
});
