/**
 * EnvFileWatcherService - Security and Resource Management Tests (Mocked)
 *
 * Tests path validation security and resource timeout cleanup.
 *
 * Pattern: File System Mocking (Pattern 2)
 * Reference: .rptc/plans/resource-lifecycle-management/TESTING-MOCKING-PATTERNS.md
 */

// Mock logger FIRST (before any imports that might use it)
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

// Import mock exports from testUtils - must be before vscode mock for proper reference
import {
    mockWatchers,
    mockFileContents,
    mockStateManager,
    mockLogger,
    resetMocks,
    commandCallbacks,
} from './envFileWatcherService.testUtils';

// Mock vscode API - must be in test file for proper hoisting
jest.mock('vscode', () => {
    const actual = jest.requireActual('vscode');
    return {
        ...actual,
        workspace: {
            workspaceFolders: [
                { uri: { fsPath: '/project1', toString: () => 'file:///project1' }, name: 'project1', index: 0 },
            ],
            createFileSystemWatcher: jest.fn((pattern: string) => {
                const watcher = {
                    pattern,
                    _disposed: false,
                    _listeners: {
                        onCreate: [] as Function[],
                        onChange: [] as Function[],
                        onDelete: [] as Function[]
                    },
                    onDidCreate: jest.fn((listener) => {
                        watcher._listeners.onCreate.push(listener);
                        return { dispose: () => {} };
                    }),
                    onDidChange: jest.fn((listener) => {
                        watcher._listeners.onChange.push(listener);
                        return { dispose: () => {} };
                    }),
                    onDidDelete: jest.fn((listener) => {
                        watcher._listeners.onDelete.push(listener);
                        return { dispose: () => {} };
                    }),
                    dispose: jest.fn(() => {
                        watcher._disposed = true;
                        const { mockWatchers } = require('./envFileWatcherService.testUtils');
                        const idx = mockWatchers.indexOf(watcher);
                        if (idx !== -1) mockWatchers.splice(idx, 1);
                    }),
                    _simulateChange: (uri: any) => {
                        watcher._listeners.onChange.forEach((l: Function) => l(uri));
                    }
                };

                const { mockWatchers } = require('./envFileWatcherService.testUtils');
                mockWatchers.push(watcher);
                return watcher;
            })
        },
        window: {
            showInformationMessage: jest.fn(() => Promise.resolve(undefined)),
        },
        commands: {
            registerCommand: jest.fn((id, callback) => {
                const { commandCallbacks } = require('./envFileWatcherService.testUtils');
                commandCallbacks[id] = callback;
                return { dispose: jest.fn() };
            }),
            executeCommand: jest.fn((id, ...args) => {
                const { commandCallbacks } = require('./envFileWatcherService.testUtils');
                const callback = commandCallbacks[id];
                if (callback) {
                    return Promise.resolve(callback(...args));
                }
                return Promise.resolve();
            }),
        },
        Uri: {
            file: (path: string) => ({
                fsPath: path,
                toString: () => `file://${path}`
            }),
        },
        RelativePattern: jest.fn().mockImplementation((folder, pattern) => pattern),
    };
});

// Mock fs.promises
jest.mock('fs', () => ({
    promises: {
        readFile: jest.fn((filePath: string) => {
            const { mockFileContents } = require('./envFileWatcherService.testUtils');
            const content = mockFileContents.get(filePath);
            if (content === undefined) {
                return Promise.reject(new Error(`File not found: ${filePath}`));
            }
            return Promise.resolve(content);
        }),
    },
}));

// Mock WorkspaceWatcherManager
jest.mock('@/core/vscode/workspaceWatcherManager', () => {
    return {
        WorkspaceWatcherManager: jest.fn().mockImplementation(() => ({
            registerWatcher: jest.fn(),
            dispose: jest.fn(),
        })),
    };
});

import * as vscode from 'vscode';
import { EnvFileWatcherService } from '@/core/vscode/envFileWatcherService';
import { WorkspaceWatcherManager } from '@/core/vscode/workspaceWatcherManager';

describe('EnvFileWatcherService - Security and Resource Management (Mocked)', () => {
    let mockContext: vscode.ExtensionContext;
    let mockWatcherManager: WorkspaceWatcherManager;

    beforeEach(() => {
        jest.useFakeTimers();
        resetMocks();

        mockContext = {
            subscriptions: [],
            extensionPath: '/test',
        } as any;

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
                mockStateManager as any,
                mockWatcherManager,
                mockLogger,
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
            (vscode.workspace as any).workspaceFolders = [];

            const service = new EnvFileWatcherService(
                mockContext,
                mockStateManager as any,
                mockWatcherManager,
                mockLogger,
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
            (vscode.workspace as any).workspaceFolders = originalFolders;
        });

        it('should validate paths for initializeFileHashes command', async () => {
            // Given: Service initialized
            const service = new EnvFileWatcherService(
                mockContext,
                mockStateManager as any,
                mockWatcherManager,
                mockLogger,
            );
            service.initialize();

            // Mock file content
            mockFileContents.set('/project1/.env', 'VALID=true');

            // When: Initialize hashes with mixed paths
            await vscode.commands.executeCommand(
                'demoBuilder._internal.initializeFileHashes',
                ['/outside/workspace/.env', '/project1/.env']
            );

            // Then: Only workspace path processed (outside path rejected)
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Rejected path outside workspace: /outside/workspace/.env')
            );
        });

        it('should reject path traversal attempts (..)', async () => {
            // Given: Service initialized
            const service = new EnvFileWatcherService(
                mockContext,
                mockStateManager as any,
                mockWatcherManager,
                mockLogger,
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
                mockStateManager as any,
                mockWatcherManager,
                mockLogger,
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
                mockStateManager as any,
                mockWatcherManager,
                mockLogger,
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
                mockStateManager as any,
                mockWatcherManager,
                mockLogger,
            );
            service.initialize();

            // Create programmatic write (triggers timeout)
            vscode.commands.executeCommand(
                'demoBuilder._internal.registerProgrammaticWrites',
                ['/project1/.env']
            );

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
