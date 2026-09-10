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

import {
    AddonUpdateChecker,
    CheckUpdatesCommand,
    ForkSyncService,
    TemplateSyncService,
    TemplateUpdateChecker,
    projectWithAddons,
    setupDefaultMocks,
} from './checkUpdates.testUtils';
import * as vscode from 'vscode';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';


// The block-library update path reaches the shared GitHub services for a token.
// The real accessor calls getLogger(), which throws in a suite that initialises
// none — so the cache is mocked to the one thing this path reads.
jest.mock('@/features/eds/handlers/edsServiceCache', () => ({
    getGitHubServices: jest.fn(() => ({
        tokenService: { getToken: jest.fn().mockResolvedValue({ token: 'gh-token' }) },
    })),
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/**
 * ADR-015 (2026-08-28): this boundary fetches the shell executor from the
 * registry, which the shared node setup resets after EVERY test — so the fake
 * is seeded per-test rather than once at module scope.
 */
beforeEach(() => {
    ServiceLocator.setCommandExecutor(createMockCommandExecutor({
        execute: jest.fn(async () => ({ code: 0, stdout: '', stderr: '' })),
    }));
});

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
        const project = projectWithAddons();

        mockStateManager.getAllProjects.mockResolvedValue([{ name: project.name, path: project.path, lastModified: new Date() }]);
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
        expect(blockItems).toHaveLength(1);
        expect(blockItems[0].commitsBehind).toBe(7);
    });

    it('should show inspector SDK update items in QuickPick', async () => {
        const { mockContext, mockStateManager, mockLogger } = setupDefaultMocks();
        const project = projectWithAddons();

        mockStateManager.getAllProjects.mockResolvedValue([{ name: project.name, path: project.path, lastModified: new Date() }]);
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
        expect(inspectorItems).toHaveLength(1);
        expect(inspectorItems[0].commitsBehind).toBe(4);
    });

    it('should not show add-on items when no libraries or SDK installed', async () => {
        const { mockContext, mockStateManager, mockLogger } = setupDefaultMocks();
        const project = projectWithAddons({
            installedBlockLibraries: undefined,
            installedInspectorSdk: undefined,
        });

        mockStateManager.getAllProjects.mockResolvedValue([{ name: project.name, path: project.path, lastModified: new Date() }]);
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
        const project = projectWithAddons();

        mockStateManager.getAllProjects.mockResolvedValue([{ name: project.name, path: project.path, lastModified: new Date() }]);
        mockStateManager.loadProjectFromPath.mockResolvedValue(project);
        mockStateManager.getCurrentProject.mockResolvedValue(project);

        // User accepts the update prompt; install succeeds; save fails.
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Update');
        const blockHelpers = require('@/features/eds/services/blockCollectionHelpers');
        blockHelpers.installBlockCollections.mockResolvedValue({ success: true, blocksCount: 1, blockIds: ['hero'] });
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
        const project = projectWithAddons();

        mockStateManager.getAllProjects.mockResolvedValue([{ name: project.name, path: project.path, lastModified: new Date() }]);
        mockStateManager.loadProjectFromPath.mockResolvedValue(project);
        mockStateManager.getCurrentProject.mockResolvedValue(project);

        // User accepts the update prompt; install succeeds.
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Update');
        const blockHelpers = require('@/features/eds/services/blockCollectionHelpers');
        blockHelpers.installBlockCollections.mockResolvedValue({ success: true, blocksCount: 1, blockIds: ['hero'] });

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
        const project = projectWithAddons({
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

        mockStateManager.getAllProjects.mockResolvedValue([{ name: project.name, path: project.path, lastModified: new Date() }]);
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
        const project = projectWithAddons({
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

        mockStateManager.getAllProjects.mockResolvedValue([{ name: project.name, path: project.path, lastModified: new Date() }]);
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
        expect(skipCalls).toHaveLength(0);
    });

    it('should NOT skip block library when template sync was not selected', async () => {
        const { mockContext, mockStateManager, mockLogger } = setupDefaultMocks();
        const project = projectWithAddons();

        mockStateManager.getAllProjects.mockResolvedValue([{ name: project.name, path: project.path, lastModified: new Date() }]);
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
        expect(skipCalls).toHaveLength(0);
    });

    it('should NOT skip block library when template sync failed', async () => {
        const { mockContext, mockStateManager, mockLogger } = setupDefaultMocks();
        const project = projectWithAddons();

        mockStateManager.getAllProjects.mockResolvedValue([{ name: project.name, path: project.path, lastModified: new Date() }]);
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
        expect(skipCalls).toHaveLength(0);
    });
});
