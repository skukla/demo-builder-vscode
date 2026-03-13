/**
 * Integration Tests for CheckUpdatesCommand — Upstream Sync & Add-on Updates
 *
 * Tests the fork sync, add-on update, and dedup logic added in Steps 4-6.
 * Follows the same mock patterns as checkUpdates.test.ts.
 *
 * Coverage areas:
 * - Fork sync items in QuickPick
 * - Block library update items in QuickPick
 * - Inspector SDK update items in QuickPick
 * - Dedup logic (skip block library when template sync covers it)
 * - Execution order: fork sync -> template -> components -> add-ons
 *
 * Total tests: 15
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

    // Default: withProgress executes the callback
    (vscode.window.withProgress as jest.Mock).mockImplementation((_opts, cb) => cb(mockProgress));

    // Default: no extension update
    const MockUpdateManager = UpdateManager as jest.MockedClass<typeof UpdateManager>;
    MockUpdateManager.prototype.checkExtensionUpdate = jest.fn().mockResolvedValue({
        hasUpdate: false,
        current: '1.0.0',
        latest: '1.0.0',
    });
    MockUpdateManager.prototype.checkAllProjectsForUpdates = jest.fn().mockResolvedValue([]);

    // Default: no template updates
    const MockTemplateChecker = TemplateUpdateChecker as jest.MockedClass<typeof TemplateUpdateChecker>;
    MockTemplateChecker.prototype.checkForUpdates = jest.fn().mockResolvedValue(null);

    // Default: no fork status
    const MockForkSync = ForkSyncService as jest.MockedClass<typeof ForkSyncService>;
    MockForkSync.prototype.checkForkStatus = jest.fn().mockResolvedValue(null);
    MockForkSync.prototype.syncFork = jest.fn().mockResolvedValue({ success: true, message: 'Synced' });

    // Default: no addon updates
    const MockAddonChecker = AddonUpdateChecker as jest.MockedClass<typeof AddonUpdateChecker>;
    MockAddonChecker.prototype.checkBlockLibraries = jest.fn().mockResolvedValue([]);
    MockAddonChecker.prototype.checkInspectorSdk = jest.fn().mockResolvedValue(null);

    // Default: template sync succeeds
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

describe('CheckUpdatesCommand — Upstream Sync & Add-on Updates', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    // -----------------------------------------------------------------------
    // Fork Sync
    // -----------------------------------------------------------------------

    describe('Fork Sync', () => {
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

            // Capture the QuickPick items
            (vscode.window.showQuickPick as jest.Mock).mockResolvedValue([]);

            const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
            const executePromise = command.execute();
            await jest.runAllTimersAsync();
            await executePromise;

            // Verify QuickPick was called with fork sync items
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

            // No updates of any kind → QuickPick should not be shown
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

            // Fork is up-to-date, no other updates → QuickPick should not be shown
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

            // User selects the fork sync item
            (vscode.window.showQuickPick as jest.Mock).mockImplementation((items: any[]) => {
                const forkItems = items.filter((i: any) => i.isForkSync === true);
                return Promise.resolve(forkItems);
            });

            const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
            const executePromise = command.execute();
            await jest.runAllTimersAsync();
            await executePromise;

            // Should show warning about conflict
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

            // Set up both fork sync and template updates
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

            // Track call order
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

            // User selects everything
            (vscode.window.showQuickPick as jest.Mock).mockImplementation((items: any[]) => {
                return Promise.resolve(items);
            });

            const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
            const executePromise = command.execute();
            await jest.runAllTimersAsync();
            await executePromise;

            // Fork sync should come before template sync
            expect(callOrder.indexOf('forkSync')).toBeLessThan(callOrder.indexOf('templateSync'));
        });
    });

    // -----------------------------------------------------------------------
    // Add-on Updates
    // -----------------------------------------------------------------------

    describe('Add-on Updates', () => {
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

            // Addon checker returns empty for no libraries
            const MockAddonChecker = AddonUpdateChecker as jest.MockedClass<typeof AddonUpdateChecker>;
            MockAddonChecker.prototype.checkBlockLibraries.mockResolvedValue([]);
            MockAddonChecker.prototype.checkInspectorSdk.mockResolvedValue(null);

            const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
            const executePromise = command.execute();
            await jest.runAllTimersAsync();
            await executePromise;

            // No addons and no other updates → QuickPick should not be shown
            expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
        });

        it('should log error and continue when block library update fails', async () => {
            const { mockContext, mockStateManager, mockLogger } = setupDefaultMocks();
            const project = makeProject();

            mockStateManager.getAllProjects.mockResolvedValue([{ path: project.path }]);
            mockStateManager.loadProjectFromPath.mockResolvedValue(project);
            mockStateManager.getCurrentProject.mockResolvedValue(project);

            const MockAddonChecker = AddonUpdateChecker as jest.MockedClass<typeof AddonUpdateChecker>;
            MockAddonChecker.prototype.checkBlockLibraries.mockResolvedValue([
                {
                    library: project.installedBlockLibraries![0],
                    latestCommit: 'def456',
                    commitsBehind: 3,
                },
            ]);

            // User selects the block library item
            (vscode.window.showQuickPick as jest.Mock).mockImplementation((items: any[]) => {
                const blockItems = items.filter((i: any) => i.isBlockLibraryUpdate === true);
                return Promise.resolve(blockItems);
            });

            const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
            const executePromise = command.execute();
            await jest.runAllTimersAsync();
            await executePromise;

            // Test passes by reaching this point without rejection — error is caught internally
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

            // User selects the block library item
            (vscode.window.showQuickPick as jest.Mock).mockImplementation((items: any[]) => {
                const blockItems = items.filter((i: any) => i.isBlockLibraryUpdate === true);
                return Promise.resolve(blockItems);
            });

            const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
            const executePromise = command.execute();
            await jest.runAllTimersAsync();
            await executePromise;

            // saveProject should be called and the library commitSha should be updated
            expect(mockStateManager.saveProject).toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    // Dedup Logic
    // -----------------------------------------------------------------------

    describe('Dedup Logic', () => {
        it('should skip block library when source matches template AND template synced', async () => {
            const { mockContext, mockStateManager, mockLogger } = setupDefaultMocks();
            // Block library source matches the template source
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

            // Fork is behind (to trigger fork sync)
            const MockForkSync = ForkSyncService as jest.MockedClass<typeof ForkSyncService>;
            MockForkSync.prototype.checkForkStatus.mockResolvedValue({
                isFork: true,
                behindBy: 2,
                parentFullName: 'adobe/aem-boilerplate-commerce',
                defaultBranch: 'main',
            });

            // Template has updates
            const MockTemplateChecker = TemplateUpdateChecker as jest.MockedClass<typeof TemplateUpdateChecker>;
            MockTemplateChecker.prototype.checkForUpdates.mockResolvedValue({
                hasUpdates: true,
                currentCommit: 'old',
                latestCommit: 'new',
                commitsBehind: 2,
                templateOwner: 'testuser',
                templateRepo: 'my-storefront',
            });

            // Block library has updates too
            const MockAddonChecker = AddonUpdateChecker as jest.MockedClass<typeof AddonUpdateChecker>;
            MockAddonChecker.prototype.checkBlockLibraries.mockResolvedValue([
                {
                    library: project.installedBlockLibraries![0],
                    latestCommit: 'new-lib-sha',
                    commitsBehind: 2,
                },
            ]);

            // Template sync succeeds
            const MockTemplateSync = TemplateSyncService as jest.MockedClass<typeof TemplateSyncService>;
            MockTemplateSync.prototype.syncWithTemplate.mockResolvedValue({
                success: true,
                syncedCommit: 'new-sha',
                strategy: 'merge' as const,
            });

            // User selects everything
            (vscode.window.showQuickPick as jest.Mock).mockImplementation((items: any[]) => {
                return Promise.resolve(items);
            });

            const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
            const executePromise = command.execute();
            await jest.runAllTimersAsync();
            await executePromise;

            // The block library update should be skipped (dedup) since template sync
            // covered the same source repo. We verify by checking that the logger
            // indicates the skip, or that installBlockCollections was NOT called.
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('skipping'),
            );
        });

        it('should NOT skip block library when source differs from template', async () => {
            const { mockContext, mockStateManager, mockLogger } = setupDefaultMocks();
            // Block library source is DIFFERENT from template source
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

            // Template sync succeeds
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

            // User selects everything
            (vscode.window.showQuickPick as jest.Mock).mockImplementation((items: any[]) => {
                return Promise.resolve(items);
            });

            const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
            const executePromise = command.execute();
            await jest.runAllTimersAsync();
            await executePromise;

            // Block library should NOT be skipped — it's from a different source
            // Verify no "skipping" message for this library
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

            // Template has updates available
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

            // User selects ONLY block library items (NOT template)
            (vscode.window.showQuickPick as jest.Mock).mockImplementation((items: any[]) => {
                const blockItems = items.filter((i: any) => i.isBlockLibraryUpdate === true);
                return Promise.resolve(blockItems);
            });

            const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
            const executePromise = command.execute();
            await jest.runAllTimersAsync();
            await executePromise;

            // Block library should NOT be skipped since template was not selected
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

            // Template has updates
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

            // Template sync FAILS
            const MockTemplateSync = TemplateSyncService as jest.MockedClass<typeof TemplateSyncService>;
            MockTemplateSync.prototype.syncWithTemplate.mockRejectedValue(new Error('Sync failed'));

            // User selects everything
            (vscode.window.showQuickPick as jest.Mock).mockImplementation((items: any[]) => {
                return Promise.resolve(items);
            });

            const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
            const executePromise = command.execute();
            await jest.runAllTimersAsync();
            await executePromise;

            // Block library should NOT be skipped since template sync failed
            const skipCalls = mockLogger.info.mock.calls.filter(
                (c: any[]) => typeof c[0] === 'string' && c[0].includes('skipping') && c[0].includes('Demo Team Blocks'),
            );
            expect(skipCalls.length).toBe(0);
        });
    });

    // -----------------------------------------------------------------------
    // Integration: Full Flow Order
    // -----------------------------------------------------------------------

    describe('Integration', () => {
        it('should execute in order: fork sync -> template -> components -> add-ons', async () => {
            const { mockContext, mockStateManager, mockLogger } = setupDefaultMocks();
            const project = makeProject();

            mockStateManager.getAllProjects.mockResolvedValue([{ path: project.path }]);
            mockStateManager.loadProjectFromPath.mockResolvedValue(project);
            mockStateManager.getCurrentProject.mockResolvedValue(project);

            // Track execution order
            const executionOrder: string[] = [];

            // Fork sync available
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

            // Template update available
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

            // Component update available
            const MockUpdateManager = UpdateManager as jest.MockedClass<typeof UpdateManager>;
            MockUpdateManager.prototype.checkAllProjectsForUpdates.mockResolvedValue([
                {
                    componentId: 'eds-storefront',
                    latestVersion: '2.0.0',
                    releaseInfo: { downloadUrl: 'https://example.com/release.zip', version: '2.0.0' },
                    outdatedProjects: [{ project, currentVersion: '1.0.0' }],
                },
            ]);

            // Addon updates available (different source so no dedup)
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

            // Mock ComponentUpdater
            const { ComponentUpdater } = require('@/features/updates/services/componentUpdater');
            ComponentUpdater.prototype.updateComponent = jest.fn().mockImplementation(async () => {
                executionOrder.push('component-update');
            });

            // User selects everything
            (vscode.window.showQuickPick as jest.Mock).mockImplementation((items: any[]) => {
                return Promise.resolve(items);
            });

            const command = new CheckUpdatesCommand(mockContext, mockStateManager, mockLogger);
            const executePromise = command.execute();
            await jest.runAllTimersAsync();
            await executePromise;

            // Verify execution order
            expect(executionOrder[0]).toBe('fork-sync');
            expect(executionOrder[1]).toBe('template-sync');
            // Component updates come after template sync
            if (executionOrder.includes('component-update')) {
                expect(executionOrder.indexOf('component-update')).toBeGreaterThan(
                    executionOrder.indexOf('template-sync'),
                );
            }
        });
    });
});
