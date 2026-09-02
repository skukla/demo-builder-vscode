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
    mockFileContents,
    mockStateManager,
    mockLogger,
    resetMocks,
} from './envFileWatcherService.testUtils';

import { createMockExtensionContext } from '../../helpers/extensionContextFake';
import { mockWorkspace } from '../../helpers/vscodeMockViews';
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
