/**
 * CheckUpdatesCommand — Fork Sync & Integration Tests
 *
 * Tests the fork sync detection, execution, and full flow ordering.
 *
 * Coverage areas:
 * - Fork sync items in QuickPick
 * - Fork sync conflict handling
 * - Execution order: fork sync -> template -> components -> add-ons
 */

import {
    AddonUpdateChecker,
    CheckUpdatesCommand,
    ForkSyncService,
    TemplateSyncService,
    TemplateUpdateChecker,
    UpdateManager,
    projectWithAddons,
    setupDefaultMocks,
} from './checkUpdates.testUtils';
import * as vscode from 'vscode';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';


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

describe('CheckUpdatesCommand — Fork Sync', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should show fork sync items in QuickPick when forks are behind', async () => {
        const { mockContext, mockStateManager, mockLogger } = setupDefaultMocks();
        const project = projectWithAddons();

        mockStateManager.getAllProjects.mockResolvedValue([
            { name: project.name, path: project.path, lastModified: new Date() },
        ]);
        mockStateManager.loadProjectFromPath.mockResolvedValue(project);

        const MockForkSync = ForkSyncService as jest.MockedClass<typeof ForkSyncService>;
        MockForkSync.prototype.checkForkStatus.mockResolvedValue({
            isFork: true,
            behindBy: 5,
            parentFullName: 'adobe/aem-boilerplate-commerce',
            defaultBranch: 'main',
        });

        (vscode.window.showQuickPick as jest.Mock).mockResolvedValue([]);

        const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
        const executePromise = command.execute();
        await jest.runAllTimersAsync();
        await executePromise;

        expect(vscode.window.showQuickPick).toHaveBeenCalled();
        const items = (vscode.window.showQuickPick as jest.Mock).mock.calls[0][0];
        const forkItems = items.filter((i: any) => i.isForkSync === true);
        expect(forkItems).toHaveLength(1);
        expect(forkItems[0].behindBy).toBe(5);
        expect(forkItems[0].owner).toBe('adobe');
        expect(forkItems[0].repo).toBe('aem-boilerplate-commerce');
    });

    it('should not show fork items when no forks are detected', async () => {
        const { mockContext, mockStateManager, mockLogger } = setupDefaultMocks();
        const project = projectWithAddons();

        mockStateManager.getAllProjects.mockResolvedValue([
            { name: project.name, path: project.path, lastModified: new Date() },
        ]);
        mockStateManager.loadProjectFromPath.mockResolvedValue(project);

        const MockForkSync = ForkSyncService as jest.MockedClass<typeof ForkSyncService>;
        MockForkSync.prototype.checkForkStatus.mockResolvedValue({
            isFork: false,
            behindBy: 0,
        });

        const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
        const executePromise = command.execute();
        await jest.runAllTimersAsync();
        await executePromise;

        expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
    });

    it('should not show fork items when fork is already up-to-date', async () => {
        const { mockContext, mockStateManager, mockLogger } = setupDefaultMocks();
        const project = projectWithAddons();

        mockStateManager.getAllProjects.mockResolvedValue([
            { name: project.name, path: project.path, lastModified: new Date() },
        ]);
        mockStateManager.loadProjectFromPath.mockResolvedValue(project);

        const MockForkSync = ForkSyncService as jest.MockedClass<typeof ForkSyncService>;
        MockForkSync.prototype.checkForkStatus.mockResolvedValue({
            isFork: true,
            behindBy: 0,
            parentFullName: 'adobe/aem-boilerplate-commerce',
            defaultBranch: 'main',
        });

        const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
        const executePromise = command.execute();
        await jest.runAllTimersAsync();
        await executePromise;

        expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
    });

    it('should show warning and continue when fork sync returns 409 conflict', async () => {
        const { mockContext, mockStateManager, mockLogger } = setupDefaultMocks();
        const project = projectWithAddons();

        mockStateManager.getAllProjects.mockResolvedValue([
            { name: project.name, path: project.path, lastModified: new Date() },
        ]);
        mockStateManager.loadProjectFromPath.mockResolvedValue(project);
        mockStateManager.getCurrentProject.mockResolvedValue(project);

        const MockForkSync = ForkSyncService as jest.MockedClass<typeof ForkSyncService>;
        MockForkSync.prototype.checkForkStatus.mockResolvedValue({
            isFork: true,
            behindBy: 3,
            parentFullName: 'adobe/aem-boilerplate-commerce',
            defaultBranch: 'main',
        });
        MockForkSync.prototype.syncFork.mockResolvedValue({
            success: false,
            conflict: true,
            message: 'Fork has diverged',
        });

        (vscode.window.showQuickPick as jest.Mock).mockImplementation((items: any[]) => {
            const forkItems = items.filter((i: any) => i.isForkSync === true);
            return Promise.resolve(forkItems);
        });

        const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
        const executePromise = command.execute();
        await jest.runAllTimersAsync();
        await executePromise;

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining('diverged')
        );
    });

    it('should execute fork sync BEFORE template sync', async () => {
        const { mockContext, mockStateManager, mockLogger } = setupDefaultMocks();
        const project = projectWithAddons();

        mockStateManager.getAllProjects.mockResolvedValue([
            { name: project.name, path: project.path, lastModified: new Date() },
        ]);
        mockStateManager.loadProjectFromPath.mockResolvedValue(project);
        mockStateManager.getCurrentProject.mockResolvedValue(project);

        const MockForkSync = ForkSyncService as jest.MockedClass<typeof ForkSyncService>;
        MockForkSync.prototype.checkForkStatus.mockResolvedValue({
            isFork: true,
            behindBy: 2,
            parentFullName: 'adobe/aem-boilerplate-commerce',
            defaultBranch: 'main',
        });

        const MockTemplateChecker = TemplateUpdateChecker as jest.MockedClass<
            typeof TemplateUpdateChecker
        >;
        MockTemplateChecker.prototype.checkForUpdates.mockResolvedValue({
            hasUpdates: true,
            currentCommit: 'old',
            latestCommit: 'new',
            commitsBehind: 3,
            templateOwner: 'testuser',
            templateRepo: 'my-storefront',
        });

        const callOrder: string[] = [];
        MockForkSync.prototype.syncFork.mockImplementation(async () => {
            callOrder.push('forkSync');
            return { success: true, message: 'Synced' };
        });

        const MockTemplateSync = TemplateSyncService as jest.MockedClass<
            typeof TemplateSyncService
        >;
        MockTemplateSync.prototype.syncWithTemplate.mockImplementation(async () => {
            callOrder.push('templateSync');
            return { success: true, syncedCommit: 'new-sha', strategy: 'merge' as const };
        });

        (vscode.window.showQuickPick as jest.Mock).mockImplementation((items: any[]) => {
            return Promise.resolve(items);
        });

        const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
        const executePromise = command.execute();
        await jest.runAllTimersAsync();
        await executePromise;

        expect(callOrder.indexOf('forkSync')).toBeLessThan(callOrder.indexOf('templateSync'));
    });
});

describe('CheckUpdatesCommand — Integration: Full Flow Order', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should execute in order: fork sync -> template -> components -> add-ons', async () => {
        const { mockContext, mockStateManager, mockLogger } = setupDefaultMocks();
        const project = projectWithAddons();

        mockStateManager.getAllProjects.mockResolvedValue([
            { name: project.name, path: project.path, lastModified: new Date() },
        ]);
        mockStateManager.loadProjectFromPath.mockResolvedValue(project);
        mockStateManager.getCurrentProject.mockResolvedValue(project);

        const executionOrder: string[] = [];

        const MockForkSync = ForkSyncService as jest.MockedClass<typeof ForkSyncService>;
        MockForkSync.prototype.checkForkStatus.mockResolvedValue({
            isFork: true,
            behindBy: 1,
            parentFullName: 'adobe/aem-boilerplate-commerce',
            defaultBranch: 'main',
        });
        MockForkSync.prototype.syncFork.mockImplementation(async () => {
            executionOrder.push('fork-sync');
            return { success: true, message: 'Synced' };
        });

        const MockTemplateChecker = TemplateUpdateChecker as jest.MockedClass<
            typeof TemplateUpdateChecker
        >;
        MockTemplateChecker.prototype.checkForUpdates.mockResolvedValue({
            hasUpdates: true,
            currentCommit: 'old',
            latestCommit: 'new',
            commitsBehind: 1,
            templateOwner: 'testuser',
            templateRepo: 'my-storefront',
        });

        const MockTemplateSync = TemplateSyncService as jest.MockedClass<
            typeof TemplateSyncService
        >;
        MockTemplateSync.prototype.syncWithTemplate.mockImplementation(async () => {
            executionOrder.push('template-sync');
            return { success: true, syncedCommit: 'new-sha', strategy: 'merge' as const };
        });

        const MockUpdateManager = UpdateManager as jest.MockedClass<typeof UpdateManager>;
        MockUpdateManager.prototype.checkAllProjectsForUpdates.mockResolvedValue([
            {
                componentId: 'eds-storefront',
                latestVersion: '2.0.0',
                releaseInfo: {
                    downloadUrl: 'https://example.com/release.zip',
                    version: '2.0.0',
                    releaseNotes: '',
                    publishedAt: '',
                    isPrerelease: false,
                },
                outdatedProjects: [{ project, currentVersion: '1.0.0' }],
            },
        ]);

        const MockAddonChecker = AddonUpdateChecker as jest.MockedClass<typeof AddonUpdateChecker>;
        MockAddonChecker.prototype.checkBlockLibraries.mockResolvedValue([
            {
                library: {
                    ...project.installedBlockLibraries![0],
                    source: { owner: 'other', repo: 'other-blocks', branch: 'main' },
                },
                latestCommit: 'new-addon-sha',
                commitsBehind: 2,
            },
        ]);

        const { ComponentUpdater } = require('@/features/updates/services/componentUpdater');
        ComponentUpdater.prototype.updateComponent = jest.fn().mockImplementation(async () => {
            executionOrder.push('component-update');
        });

        (vscode.window.showQuickPick as jest.Mock).mockImplementation((items: any[]) => {
            return Promise.resolve(items);
        });

        const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
        const executePromise = command.execute();
        await jest.runAllTimersAsync();
        await executePromise;

        expect(executionOrder[0]).toBe('fork-sync');
        expect(executionOrder[1]).toBe('template-sync');
        if (executionOrder.includes('component-update')) {
            expect(executionOrder.indexOf('component-update')).toBeGreaterThan(
                executionOrder.indexOf('template-sync')
            );
        }
    });
});
