/**
 * EnvFileWatcherService - Security and Resource Management Tests (Mocked)
 *
 * Tests path validation security and resource timeout cleanup.
 *
 * Pattern: File System Mocking (Pattern 2)
 * Reference: .rptc/plans/resource-lifecycle-management/TESTING-MOCKING-PATTERNS.md
 */

import {
    EnvFileWatcherService,
    WorkspaceWatcherManager,
    vscode,
    mockWatchers,
    mockFileContents,
    mockStateManager,
    mockLogger,
    resetMocks,
    settleFileChange,
} from './envFileWatcherService.testUtils';

import { createMockExtensionContext } from '../../helpers/extensionContextFake';
import { createMockProject } from '../../helpers/projectFake';
import { mockWorkspace } from '../../helpers/vscodeMockViews';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

describe('EnvFileWatcherService - Security and Resource Management (Mocked)', () => {
    let mockContext: vscode.ExtensionContext;
    let mockWatcherManager: WorkspaceWatcherManager;

    beforeEach(() => {
        jest.useFakeTimers();
        resetMocks();

        // The canonical fake, with this suite's path. The literal it replaces named
        // two of ExtensionContext's twenty-one members and cast the difference away.
        mockContext = createMockExtensionContext({ subscriptions: [] }, '/test');

        mockWatcherManager = new WorkspaceWatcherManager();
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    describe('Security: Path Validation', () => {
        it('should reject paths outside workspace folders', async () => {
            // Given: Service initialized
            const service = new EnvFileWatcherService(
                mockContext,
                mockStateManager,
                mockWatcherManager,
                mockLogger
            );
            service.initialize();

            // When: Internal command called with path outside workspace
            await vscode.commands.executeCommand(
                'demoBuilder._internal.registerProgrammaticWrites',
                ['/outside/workspace/.env', '/project1/.env']
            );

            // Then: Only workspace path should be registered (verified via logging)
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Rejected path outside workspace: /outside/workspace/.env')
            );
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Registered 1 programmatic writes')
            );
        });

        it('should reject all paths when no workspace folders exist', async () => {
            // Given: No workspace folders
            const originalFolders = vscode.workspace.workspaceFolders;
            mockWorkspace.workspaceFolders = [];

            const _service = new EnvFileWatcherService(
                mockContext,
                mockStateManager,
                mockWatcherManager,
                mockLogger
            );

            // When: Internal command called
            await vscode.commands.executeCommand(
                'demoBuilder._internal.registerProgrammaticWrites',
                ['/project1/.env']
            );

            // Then: All paths rejected (no "Registered" log since 0 paths validated)
            expect(mockLogger.debug).not.toHaveBeenCalledWith(
                expect.stringContaining('Registered')
            );

            // Restore
            mockWorkspace.workspaceFolders = originalFolders;
        });

        it('should validate paths for initializeFileHashes command', async () => {
            // Given: Service initialized
            const service = new EnvFileWatcherService(
                mockContext,
                mockStateManager,
                mockWatcherManager,
                mockLogger
            );
            service.initialize();

            // Mock file content
            mockFileContents.set('/project1/.env', 'VALID=true');

            // When: Initialize hashes with mixed paths
            await vscode.commands.executeCommand('demoBuilder._internal.initializeFileHashes', [
                '/outside/workspace/.env',
                '/project1/.env',
            ]);

            // Then: Only workspace path processed (outside path rejected)
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Rejected path outside workspace: /outside/workspace/.env')
            );
        });

        it('should reject path traversal attempts (..)', async () => {
            // Given: Service initialized
            const service = new EnvFileWatcherService(
                mockContext,
                mockStateManager,
                mockWatcherManager,
                mockLogger
            );
            service.initialize();

            // When: Internal command called with path traversal attempt
            await vscode.commands.executeCommand(
                'demoBuilder._internal.registerProgrammaticWrites',
                ['/project1/../outside/.env']
            );

            // Then: Path traversal attempt rejected (normalized path is outside workspace)
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Rejected path outside workspace')
            );
        });

        it('should reject similar prefix paths (workspace1-fake)', async () => {
            // Given: Service initialized with workspace at /project1
            const service = new EnvFileWatcherService(
                mockContext,
                mockStateManager,
                mockWatcherManager,
                mockLogger
            );
            service.initialize();

            // When: Path with similar prefix but not actually in workspace
            await vscode.commands.executeCommand(
                'demoBuilder._internal.registerProgrammaticWrites',
                ['/project1-fake/.env']
            );

            // Then: Similar prefix path rejected (not a real subdirectory)
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Rejected path outside workspace: /project1-fake/.env')
            );
        });

        it('should survive a window with no workspace at all', async () => {
            // workspaceFolders is undefined, not empty, before any folder is opened.
            // The fallback has to produce a real empty list: anything else reaches
            // folder.uri on a value that has none and throws out of the command.
            const originalFolders = mockWorkspace.workspaceFolders;
            mockWorkspace.workspaceFolders = undefined;

            try {
                new EnvFileWatcherService(
                    mockContext,
                    mockStateManager,
                    mockWatcherManager,
                    mockLogger
                );

                await expect(
                    vscode.commands.executeCommand(
                        'demoBuilder._internal.registerProgrammaticWrites',
                        ['/project1/.env']
                    )
                ).resolves.toBeUndefined();
            } finally {
                mockWorkspace.workspaceFolders = originalFolders;
            }
        });

        it('should accept a path in ANY open workspace folder, not just the first', async () => {
            const originalFolders = mockWorkspace.workspaceFolders;
            mockWorkspace.workspaceFolders = [
                { uri: vscode.Uri.file('/project1'), name: 'project1', index: 0 },
                { uri: vscode.Uri.file('/project2'), name: 'project2', index: 1 },
            ];

            try {
                const service = new EnvFileWatcherService(
                    mockContext,
                    mockStateManager,
                    mockWatcherManager,
                    mockLogger
                );
                service.initialize();

                // Hashing the path is what proves it passed validation: a rejected
                // path records nothing, so its next change reads as a first sighting.
                const filePath = '/project2/.env';
                mockFileContents.set(filePath, 'API_KEY=test123');
                await vscode.commands.executeCommand('demoBuilder._internal.initializeFileHashes', [
                    filePath,
                ]);

                mockStateManager.getCurrentProject.mockResolvedValue(
                    createMockProject({ status: 'running' })
                );
                mockFileContents.set(filePath, 'API_KEY=test456');
                mockWatchers[0]._simulateChange(vscode.Uri.file(filePath));
                await settleFileChange();

                expect(vscode.window.showInformationMessage).toHaveBeenCalled();
            } finally {
                mockWorkspace.workspaceFolders = originalFolders;
            }
        });
    });

    describe('Resource Management: Timeout Cleanup', () => {
        it('should track active timeouts', async () => {
            // Given: Service initialized
            const service = new EnvFileWatcherService(
                mockContext,
                mockStateManager,
                mockWatcherManager,
                mockLogger
            );
            service.initialize();

            // When: Register programmatic writes (creates timeout)
            await vscode.commands.executeCommand(
                'demoBuilder._internal.registerProgrammaticWrites',
                ['/project1/.env']
            );

            // Then: Timeout should be tracked (verified by checking timeout was set)
            // Note: We can't directly inspect private activeTimeouts set,
            // but we verify timeout cleanup behavior in next test
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Registered 1 programmatic writes')
            );
        });

        it('should stop suppressing a path once the cleanup delay has passed', async () => {
            // The suppression is a safety net for watcher events that never arrive.
            // Without the cleanup the path stays muted for the rest of the session,
            // so a real edit by the SC would go unnoticed.
            const service = new EnvFileWatcherService(
                mockContext,
                mockStateManager,
                mockWatcherManager,
                mockLogger
            );
            service.initialize();

            const filePath = '/project1/.env';
            mockFileContents.set(filePath, 'API_KEY=test123');
            await vscode.commands.executeCommand('demoBuilder._internal.initializeFileHashes', [
                filePath,
            ]);
            await vscode.commands.executeCommand(
                'demoBuilder._internal.registerProgrammaticWrites',
                [filePath]
            );

            jest.advanceTimersByTime(TIMEOUTS.PROGRAMMATIC_WRITE_CLEANUP);

            mockStateManager.getCurrentProject.mockResolvedValue(
                createMockProject({ status: 'running' })
            );
            mockFileContents.set(filePath, 'API_KEY=test456');
            mockWatchers[0]._simulateChange(vscode.Uri.file(filePath));
            await settleFileChange();

            expect(vscode.window.showInformationMessage).toHaveBeenCalled();
        });

        it('should leave no pending timer behind after disposal', async () => {
            const service = new EnvFileWatcherService(
                mockContext,
                mockStateManager,
                mockWatcherManager,
                mockLogger
            );
            service.initialize();

            await vscode.commands.executeCommand(
                'demoBuilder._internal.registerProgrammaticWrites',
                ['/project1/.env']
            );
            expect(jest.getTimerCount()).toBeGreaterThan(0);

            service.dispose();

            // A timer surviving disposal fires into a service that no longer exists.
            expect(jest.getTimerCount()).toBe(0);
        });

        it('should clear all timeouts on disposal', () => {
            // Given: Service with active timeouts
            const service = new EnvFileWatcherService(
                mockContext,
                mockStateManager,
                mockWatcherManager,
                mockLogger
            );
            service.initialize();

            // Create programmatic write (triggers timeout)
            vscode.commands.executeCommand('demoBuilder._internal.registerProgrammaticWrites', [
                '/project1/.env',
            ]);

            // When: Service disposed
            service.dispose();

            // Then: Service should be disposed (verified via logging)
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Service disposed')
            );

            // Disposal should not crash even with active timeouts
            // (clearTimeout handles this gracefully)
        });
    });
});
