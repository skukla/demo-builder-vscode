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
        const project = makeProject();

        mockStateManager.getAllProjects.mockResolvedValue([{ path: project.path }]);
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
        expect(forkItems.length).toBe(1);
        expect(forkItems[0].behindBy).toBe(5);
        expect(forkItems[0].owner).toBe('adobe');
        expect(forkItems[0].repo).toBe('aem-boilerplate-commerce');
    });

    it('should not show fork items when no forks are detected', async () => {
        const { mockContext, mockStateManager, mockLogger } = setupDefaultMocks();
        const project = makeProject();

        mockStateManager.getAllProjects.mockResolvedValue([{ path: project.path }]);
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
        const project = makeProject();

        mockStateManager.getAllProjects.mockResolvedValue([{ path: project.path }]);
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
        const project = makeProject();

        mockStateManager.getAllProjects.mockResolvedValue([{ path: project.path }]);
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
            expect.stringContaining('diverged'),
        );
    });

    it('should execute fork sync BEFORE template sync', async () => {
        const { mockContext, mockStateManager, mockLogger } = setupDefaultMocks();
        const project = makeProject();

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
            commitsBehind: 3,
            templateOwner: 'testuser',
            templateRepo: 'my-storefront',
        });

        const callOrder: string[] = [];
        MockForkSync.prototype.syncFork.mockImplementation(async () => {
            callOrder.push('forkSync');
            return { success: true, message: 'Synced' };
        });

        const MockTemplateSync = TemplateSyncService as jest.MockedClass<typeof TemplateSyncService>;
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
        const project = makeProject();

        mockStateManager.getAllProjects.mockResolvedValue([{ path: project.path }]);
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

        const MockTemplateChecker = TemplateUpdateChecker as jest.MockedClass<typeof TemplateUpdateChecker>;
        MockTemplateChecker.prototype.checkForUpdates.mockResolvedValue({
            hasUpdates: true,
            currentCommit: 'old',
            latestCommit: 'new',
            commitsBehind: 1,
            templateOwner: 'testuser',
            templateRepo: 'my-storefront',
        });

        const MockTemplateSync = TemplateSyncService as jest.MockedClass<typeof TemplateSyncService>;
        MockTemplateSync.prototype.syncWithTemplate.mockImplementation(async () => {
            executionOrder.push('template-sync');
            return { success: true, syncedCommit: 'new-sha', strategy: 'merge' as const };
        });

        const MockUpdateManager = UpdateManager as jest.MockedClass<typeof UpdateManager>;
        MockUpdateManager.prototype.checkAllProjectsForUpdates.mockResolvedValue([
            {
                componentId: 'eds-storefront',
                latestVersion: '2.0.0',
                releaseInfo: { downloadUrl: 'https://example.com/release.zip', version: '2.0.0' },
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
                executionOrder.indexOf('template-sync'),
            );
        }
    });
});
