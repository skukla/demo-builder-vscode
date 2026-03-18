/**
 * CheckUpdatesCommand — Add-on Updates & Dedup Logic Tests
 *
 * Tests the add-on update detection (block libraries, inspector SDK)
 * and dedup logic (skip block library when template sync covers it).
 *
 * Coverage areas:
 * - Block library update items in QuickPick
 * - Inspector SDK update items in QuickPick
 * - Error handling for failed block library updates
 * - Dedup logic (skip block library when template sync covers same source)
 */

import * as vscode from 'vscode';
import { CheckUpdatesCommand } from '@/features/updates/commands/checkUpdates';
import { UpdateManager } from '@/features/updates/services/updateManager';
import { ForkSyncService } from '@/features/updates/services/forkSyncService';
import { AddonUpdateChecker } from '@/features/updates/services/addonUpdateChecker';
import { TemplateSyncService } from '@/features/updates/services/templateSyncService';
import { TemplateUpdateChecker } from '@/features/updates/services/templateUpdateChecker';
import { COMPONENT_IDS } from '@/core/constants';
import type { Logger } from '@/core/logging';
import type { StateManager } from '@/core/state';
import type { Project } from '@/types';

// Mock VS Code API
jest.mock('vscode', () => ({
    window: {
        withProgress: jest.fn(),
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        showErrorMessage: jest.fn().mockResolvedValue(undefined),
        showQuickPick: jest.fn(),
    },
    ProgressLocation: {
        Notification: 15,
    },
    QuickPickItemKind: {
        Separator: 1,
    },
    commands: {
        executeCommand: jest.fn(),
    },
}));

// Mock services
jest.mock('@/features/updates/services/updateManager');
jest.mock('@/features/updates/services/componentUpdater');
jest.mock('@/features/updates/services/extensionUpdater');
jest.mock('@/features/updates/services/forkSyncService');
jest.mock('@/features/updates/services/addonUpdateChecker');
jest.mock('@/features/updates/services/templateSyncService');
jest.mock('@/features/updates/services/templateUpdateChecker');

// Mock block collection and inspector helpers (for addon application)
jest.mock('@/features/eds/services/blockCollectionHelpers');
jest.mock('@/features/eds/services/inspectorHelpers');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'test-project',
        path: '/projects/test-project',
        status: 'stopped',
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                type: 'frontend',
                version: '1.0.0',
                metadata: {
                    templateOwner: 'adobe',
                    templateRepo: 'aem-boilerplate-commerce',
                    edsRepoOwner: 'testuser',
                    edsRepoName: 'my-storefront',
                    edsBranch: 'main',
                },
            },
        },
        installedBlockLibraries: [
            {
                name: 'Demo Team Blocks',
                source: { owner: 'adobe', repo: 'aem-boilerplate-commerce', branch: 'main' },
                commitSha: 'abc123',
                blockIds: ['hero', 'cards'],
                installedAt: '2025-01-01T00:00:00Z',
            },
        ],
        installedInspectorSdk: {
            commitSha: 'sdk-abc123',
            installedAt: '2025-01-01T00:00:00Z',
        },
        ...overrides,
    } as unknown as Project;
}

function setupDefaultMocks(): {
    mockProgress: { report: jest.Mock };
    mockContext: any;
    mockStateManager: jest.Mocked<StateManager>;
    mockLogger: jest.Mocked<Logger>;
} {
    const mockProgress = { report: jest.fn() };

    const mockContext = {
        subscriptions: [],
        extensionPath: '/ext',
        globalState: { get: jest.fn(), update: jest.fn() },
        secrets: { get: jest.fn(), store: jest.fn() },
    };

    const mockStateManager = {
        getCurrentProject: jest.fn().mockResolvedValue(null),
        saveProject: jest.fn().mockResolvedValue(undefined),
        getAllProjects: jest.fn().mockResolvedValue([]),
        loadProjectFromPath: jest.fn().mockResolvedValue(null),
    } as any;

    const mockLogger = {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    } as any;

    (vscode.window.withProgress as jest.Mock).mockImplementation((_opts, cb) => cb(mockProgress));

    const MockUpdateManager = UpdateManager as jest.MockedClass<typeof UpdateManager>;
    MockUpdateManager.prototype.checkExtensionUpdate = jest.fn().mockResolvedValue({
        hasUpdate: false,
        current: '1.0.0',
        latest: '1.0.0',
    });
    MockUpdateManager.prototype.checkAllProjectsForUpdates = jest.fn().mockResolvedValue([]);

    const MockTemplateChecker = TemplateUpdateChecker as jest.MockedClass<typeof TemplateUpdateChecker>;
    MockTemplateChecker.prototype.checkForUpdates = jest.fn().mockResolvedValue(null);

    const MockForkSync = ForkSyncService as jest.MockedClass<typeof ForkSyncService>;
    MockForkSync.prototype.checkForkStatus = jest.fn().mockResolvedValue(null);
    MockForkSync.prototype.syncFork = jest.fn().mockResolvedValue({ success: true, message: 'Synced' });

    const MockAddonChecker = AddonUpdateChecker as jest.MockedClass<typeof AddonUpdateChecker>;
    MockAddonChecker.prototype.checkBlockLibraries = jest.fn().mockResolvedValue([]);
    MockAddonChecker.prototype.checkInspectorSdk = jest.fn().mockResolvedValue(null);

    const MockTemplateSync = TemplateSyncService as jest.MockedClass<typeof TemplateSyncService>;
    MockTemplateSync.prototype.syncWithTemplate = jest.fn().mockResolvedValue({
        success: true,
        syncedCommit: 'new-commit-sha',
        strategy: 'merge',
    });
    MockTemplateSync.prototype.updateLastSyncedCommit = jest.fn().mockResolvedValue(undefined);

    return { mockProgress, mockContext, mockStateManager, mockLogger };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CheckUpdatesCommand — Add-on Updates', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should show block library update items in QuickPick', async () => {
        const { mockContext, mockStateManager, mockLogger } = setupDefaultMocks();
        const project = makeProject();

        mockStateManager.getAllProjects.mockResolvedValue([{ path: project.path }]);
        mockStateManager.loadProjectFromPath.mockResolvedValue(project);

        const MockAddonChecker = AddonUpdateChecker as jest.MockedClass<typeof AddonUpdateChecker>;
        MockAddonChecker.prototype.checkBlockLibraries.mockResolvedValue([
            {
                library: project.installedBlockLibraries![0],
                latestCommit: 'def456',
                commitsBehind: 7,
            },
        ]);

        (vscode.window.showQuickPick as jest.Mock).mockResolvedValue([]);

        const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
        const executePromise = command.execute();
        await jest.runAllTimersAsync();
        await executePromise;

        expect(vscode.window.showQuickPick).toHaveBeenCalled();
        const items = (vscode.window.showQuickPick as jest.Mock).mock.calls[0][0];
        const blockItems = items.filter((i: any) => i.isBlockLibraryUpdate === true);
        expect(blockItems.length).toBe(1);
        expect(blockItems[0].commitsBehind).toBe(7);
    });

    it('should show inspector SDK update items in QuickPick', async () => {
        const { mockContext, mockStateManager, mockLogger } = setupDefaultMocks();
        const project = makeProject();

        mockStateManager.getAllProjects.mockResolvedValue([{ path: project.path }]);
        mockStateManager.loadProjectFromPath.mockResolvedValue(project);

        const MockAddonChecker = AddonUpdateChecker as jest.MockedClass<typeof AddonUpdateChecker>;
        MockAddonChecker.prototype.checkInspectorSdk.mockResolvedValue({
            hasUpdate: true,
            currentCommit: 'sdk-abc123',
            latestCommit: 'sdk-def456',
            commitsBehind: 4,
        });

        (vscode.window.showQuickPick as jest.Mock).mockResolvedValue([]);

        const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
        const executePromise = command.execute();
        await jest.runAllTimersAsync();
        await executePromise;

        expect(vscode.window.showQuickPick).toHaveBeenCalled();
        const items = (vscode.window.showQuickPick as jest.Mock).mock.calls[0][0];
        const inspectorItems = items.filter((i: any) => i.isInspectorUpdate === true);
        expect(inspectorItems.length).toBe(1);
        expect(inspectorItems[0].commitsBehind).toBe(4);
    });

    it('should not show add-on items when no libraries or SDK installed', async () => {
        const { mockContext, mockStateManager, mockLogger } = setupDefaultMocks();
        const project = makeProject({
            installedBlockLibraries: undefined,
            installedInspectorSdk: undefined,
        });

        mockStateManager.getAllProjects.mockResolvedValue([{ path: project.path }]);
        mockStateManager.loadProjectFromPath.mockResolvedValue(project);

        const MockAddonChecker = AddonUpdateChecker as jest.MockedClass<typeof AddonUpdateChecker>;
        MockAddonChecker.prototype.checkBlockLibraries.mockResolvedValue([]);
        MockAddonChecker.prototype.checkInspectorSdk.mockResolvedValue(null);

        const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
        const executePromise = command.execute();
        await jest.runAllTimersAsync();
        await executePromise;

        expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
    });

    it('should log error and continue when block library update fails', async () => {
        const { mockContext, mockStateManager, mockLogger } = setupDefaultMocks();
        const project = makeProject();

        mockStateManager.getAllProjects.mockResolvedValue([{ path: project.path }]);
        mockStateManager.loadProjectFromPath.mockResolvedValue(project);
        mockStateManager.getCurrentProject.mockResolvedValue(project);

        mockStateManager.saveProject.mockRejectedValue(new Error('Save failed'));

        const MockAddonChecker = AddonUpdateChecker as jest.MockedClass<typeof AddonUpdateChecker>;
        MockAddonChecker.prototype.checkBlockLibraries.mockResolvedValue([
            {
                library: project.installedBlockLibraries![0],
                latestCommit: 'def456',
                commitsBehind: 3,
            },
        ]);

        (vscode.window.showQuickPick as jest.Mock).mockImplementation((items: any[]) => {
            const blockItems = items.filter((i: any) => i.isBlockLibraryUpdate === true);
            return Promise.resolve(blockItems);
        });

        const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
        const executePromise = command.execute();
        await jest.runAllTimersAsync();
        await executePromise;

        expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    });

    it('should save updated commitSha after successful block library update', async () => {
        const { mockContext, mockStateManager, mockLogger } = setupDefaultMocks();
        const project = makeProject();

        mockStateManager.getAllProjects.mockResolvedValue([{ path: project.path }]);
        mockStateManager.loadProjectFromPath.mockResolvedValue(project);
        mockStateManager.getCurrentProject.mockResolvedValue(project);

        const MockAddonChecker = AddonUpdateChecker as jest.MockedClass<typeof AddonUpdateChecker>;
        MockAddonChecker.prototype.checkBlockLibraries.mockResolvedValue([
            {
                library: project.installedBlockLibraries![0],
                latestCommit: 'new-commit-sha',
                commitsBehind: 3,
            },
        ]);

        (vscode.window.showQuickPick as jest.Mock).mockImplementation((items: any[]) => {
            const blockItems = items.filter((i: any) => i.isBlockLibraryUpdate === true);
            return Promise.resolve(blockItems);
        });

        const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
        const executePromise = command.execute();
        await jest.runAllTimersAsync();
        await executePromise;

        expect(mockStateManager.saveProject).toHaveBeenCalled();
    });
});

describe('CheckUpdatesCommand — Dedup Logic', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should skip block library when source matches template AND template synced', async () => {
        const { mockContext, mockStateManager, mockLogger } = setupDefaultMocks();
        const project = makeProject({
            installedBlockLibraries: [
                {
                    name: 'Template Blocks',
                    source: { owner: 'adobe', repo: 'aem-boilerplate-commerce', branch: 'main' },
                    commitSha: 'old-sha',
                    blockIds: ['hero'],
                    installedAt: '2025-01-01T00:00:00Z',
                },
            ],
        });

        mockStateManager.getAllProjects.mockResolvedValue([{ path: project.path }]);
        mockStateManager.loadProjectFromPath.mockResolvedValue(project);
        mockStateManager.getCurrentProject.mockResolvedValue(project);

        const MockForkSync = ForkSyncService as jest.MockedClass<typeof ForkSyncService>;
        MockForkSync.prototype.checkForkStatus.mockResolvedValue({
            isFork: true,
            behindBy: 2,
            parentFullName: 'adobe/aem-boilerplate-commerce',
            defaultBranch: 'main',
        });

        const MockTemplateChecker = TemplateUpdateChecker as jest.MockedClass<typeof TemplateUpdateChecker>;
        MockTemplateChecker.prototype.checkForUpdates.mockResolvedValue({
            hasUpdates: true,
            currentCommit: 'old',
            latestCommit: 'new',
            commitsBehind: 2,
            templateOwner: 'testuser',
            templateRepo: 'my-storefront',
        });

        const MockAddonChecker = AddonUpdateChecker as jest.MockedClass<typeof AddonUpdateChecker>;
        MockAddonChecker.prototype.checkBlockLibraries.mockResolvedValue([
            {
                library: project.installedBlockLibraries![0],
                latestCommit: 'new-lib-sha',
                commitsBehind: 2,
            },
        ]);

        const MockTemplateSync = TemplateSyncService as jest.MockedClass<typeof TemplateSyncService>;
        MockTemplateSync.prototype.syncWithTemplate.mockResolvedValue({
            success: true,
            syncedCommit: 'new-sha',
            strategy: 'merge' as const,
        });

        (vscode.window.showQuickPick as jest.Mock).mockImplementation((items: any[]) => {
            return Promise.resolve(items);
        });

        const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
        const executePromise = command.execute();
        await jest.runAllTimersAsync();
        await executePromise;

        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('skipping'),
        );
    });

    it('should NOT skip block library when source differs from template', async () => {
        const { mockContext, mockStateManager, mockLogger } = setupDefaultMocks();
        const project = makeProject({
            installedBlockLibraries: [
                {
                    name: 'External Blocks',
                    source: { owner: 'other-org', repo: 'other-blocks', branch: 'main' },
                    commitSha: 'old-sha',
                    blockIds: ['widget'],
                    installedAt: '2025-01-01T00:00:00Z',
                },
            ],
        });

        mockStateManager.getAllProjects.mockResolvedValue([{ path: project.path }]);
        mockStateManager.loadProjectFromPath.mockResolvedValue(project);
        mockStateManager.getCurrentProject.mockResolvedValue(project);

        const MockTemplateChecker = TemplateUpdateChecker as jest.MockedClass<typeof TemplateUpdateChecker>;
        MockTemplateChecker.prototype.checkForUpdates.mockResolvedValue({
            hasUpdates: true,
            currentCommit: 'old',
            latestCommit: 'new',
            commitsBehind: 2,
            templateOwner: 'testuser',
            templateRepo: 'my-storefront',
        });

        const MockAddonChecker = AddonUpdateChecker as jest.MockedClass<typeof AddonUpdateChecker>;
        MockAddonChecker.prototype.checkBlockLibraries.mockResolvedValue([
            {
                library: project.installedBlockLibraries![0],
                latestCommit: 'new-ext-sha',
                commitsBehind: 5,
            },
        ]);

        const MockTemplateSync = TemplateSyncService as jest.MockedClass<typeof TemplateSyncService>;
        MockTemplateSync.prototype.syncWithTemplate.mockResolvedValue({
            success: true,
            syncedCommit: 'new-sha',
            strategy: 'merge' as const,
        });

        (vscode.window.showQuickPick as jest.Mock).mockImplementation((items: any[]) => {
            return Promise.resolve(items);
        });

        const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
        const executePromise = command.execute();
        await jest.runAllTimersAsync();
        await executePromise;

        const skipCalls = mockLogger.info.mock.calls.filter(
            (c: any[]) => typeof c[0] === 'string' && c[0].includes('skipping') && c[0].includes('External Blocks'),
        );
        expect(skipCalls.length).toBe(0);
    });

    it('should NOT skip block library when template sync was not selected', async () => {
        const { mockContext, mockStateManager, mockLogger } = setupDefaultMocks();
        const project = makeProject();

        mockStateManager.getAllProjects.mockResolvedValue([{ path: project.path }]);
        mockStateManager.loadProjectFromPath.mockResolvedValue(project);
        mockStateManager.getCurrentProject.mockResolvedValue(project);

        const MockTemplateChecker = TemplateUpdateChecker as jest.MockedClass<typeof TemplateUpdateChecker>;
        MockTemplateChecker.prototype.checkForUpdates.mockResolvedValue({
            hasUpdates: true,
            currentCommit: 'old',
            latestCommit: 'new',
            commitsBehind: 3,
            templateOwner: 'testuser',
            templateRepo: 'my-storefront',
        });

        const MockAddonChecker = AddonUpdateChecker as jest.MockedClass<typeof AddonUpdateChecker>;
        MockAddonChecker.prototype.checkBlockLibraries.mockResolvedValue([
            {
                library: project.installedBlockLibraries![0],
                latestCommit: 'new-lib-sha',
                commitsBehind: 2,
            },
        ]);

        (vscode.window.showQuickPick as jest.Mock).mockImplementation((items: any[]) => {
            const blockItems = items.filter((i: any) => i.isBlockLibraryUpdate === true);
            return Promise.resolve(blockItems);
        });

        const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
        const executePromise = command.execute();
        await jest.runAllTimersAsync();
        await executePromise;

        const skipCalls = mockLogger.info.mock.calls.filter(
            (c: any[]) => typeof c[0] === 'string' && c[0].includes('skipping'),
        );
        expect(skipCalls.length).toBe(0);
    });

    it('should NOT skip block library when template sync failed', async () => {
        const { mockContext, mockStateManager, mockLogger } = setupDefaultMocks();
        const project = makeProject();

        mockStateManager.getAllProjects.mockResolvedValue([{ path: project.path }]);
        mockStateManager.loadProjectFromPath.mockResolvedValue(project);
        mockStateManager.getCurrentProject.mockResolvedValue(project);

        const MockTemplateChecker = TemplateUpdateChecker as jest.MockedClass<typeof TemplateUpdateChecker>;
        MockTemplateChecker.prototype.checkForUpdates.mockResolvedValue({
            hasUpdates: true,
            currentCommit: 'old',
            latestCommit: 'new',
            commitsBehind: 2,
            templateOwner: 'testuser',
            templateRepo: 'my-storefront',
        });

        const MockAddonChecker = AddonUpdateChecker as jest.MockedClass<typeof AddonUpdateChecker>;
        MockAddonChecker.prototype.checkBlockLibraries.mockResolvedValue([
            {
                library: project.installedBlockLibraries![0],
                latestCommit: 'new-lib-sha',
                commitsBehind: 2,
            },
        ]);

        const MockTemplateSync = TemplateSyncService as jest.MockedClass<typeof TemplateSyncService>;
        MockTemplateSync.prototype.syncWithTemplate.mockRejectedValue(new Error('Sync failed'));

        (vscode.window.showQuickPick as jest.Mock).mockImplementation((items: any[]) => {
            return Promise.resolve(items);
        });

        const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
        const executePromise = command.execute();
        await jest.runAllTimersAsync();
        await executePromise;

        const skipCalls = mockLogger.info.mock.calls.filter(
            (c: any[]) => typeof c[0] === 'string' && c[0].includes('skipping') && c[0].includes('Demo Team Blocks'),
        );
        expect(skipCalls.length).toBe(0);
    });
});
