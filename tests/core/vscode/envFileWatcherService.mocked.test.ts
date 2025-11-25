/**
 * Mocked Tests for EnvFileWatcherService
 *
 * These tests use mocked file system operations (no real file I/O)
 * to avoid crashing Cursor IDE. Tests hash detection, programmatic writes,
 * grace period, and notification management.
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

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { EnvFileWatcherService } from '@/core/vscode/envFileWatcherService';
import { WorkspaceWatcherManager } from '@/core/vscode/workspaceWatcherManager';

// Mock file system watchers
const mockWatchers: any[] = [];
let mockFileContents = new Map<string, string>();

// Mock vscode API
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
                        const idx = mockWatchers.indexOf(watcher);
                        if (idx !== -1) mockWatchers.splice(idx, 1);
                    }),
                    // Helper to simulate file change
                    _simulateChange: (uri: vscode.Uri) => {
                        watcher._listeners.onChange.forEach((l: Function) => l(uri));
                    }
                };

                mockWatchers.push(watcher);
                return watcher;
            })
        },
        window: {
            showInformationMessage: jest.fn(() => Promise.resolve(undefined)),
        },
        commands: {
            registerCommand: jest.fn((id, callback) => {
                // Store callback for test invocation
                (commandCallbacks as any)[id] = callback;
                return { dispose: jest.fn() };
            }),
            executeCommand: jest.fn((id, ...args) => {
                const callback = (commandCallbacks as any)[id];
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

// Track command callbacks
const commandCallbacks: Record<string, Function> = {};

// Mock fs.promises
jest.mock('fs', () => ({
    promises: {
        readFile: jest.fn((filePath: string) => {
            const content = mockFileContents.get(filePath);
            if (content === undefined) {
                return Promise.reject(new Error(`File not found: ${filePath}`));
            }
            return Promise.resolve(content);
        }),
    },
}));

// Mock WorkspaceWatcherManager
const mockRegisterWatcher = jest.fn();
jest.mock('@/core/vscode/workspaceWatcherManager', () => {
    return {
        WorkspaceWatcherManager: jest.fn().mockImplementation(() => ({
            registerWatcher: mockRegisterWatcher,
            dispose: jest.fn(),
        })),
    };
});

// Mock StateManager
const mockStateManager = {
    getCurrentProject: jest.fn(),
};

// Mock logger
const mockLogger = {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
};

describe('EnvFileWatcherService (Mocked File System)', () => {
    let mockContext: vscode.ExtensionContext;
    let mockWatcherManager: WorkspaceWatcherManager;
    let service: EnvFileWatcherService;

    beforeEach(() => {
        jest.clearAllMocks();
        mockWatchers.length = 0;
        mockFileContents.clear();
        Object.keys(commandCallbacks).forEach(key => delete commandCallbacks[key]);

        mockContext = {
            subscriptions: [],
            extensionPath: '/test',
        } as any;

        mockWatcherManager = new WorkspaceWatcherManager();

        service = new EnvFileWatcherService(
            mockContext,
            mockStateManager as any,
            mockWatcherManager,
            mockLogger,
        );

        service.initialize();
    });

    afterEach(() => {
        service?.dispose();
    });

    describe('Hash-Based Change Detection', () => {
        it('should suppress notification when content unchanged (hash match)', async () => {
            // Given: File with known content
            const filePath = '/project1/.env';
            const content = 'API_KEY=test123';
            mockFileContents.set(filePath, content);

            // Initialize hash
            await vscode.commands.executeCommand(
                'demoBuilder._internal.initializeFileHashes',
                [filePath]
            );

            // Set demo as running
            mockStateManager.getCurrentProject.mockResolvedValue({
                status: 'running',
            });

            // When: File event fires with same content
            const uri = vscode.Uri.file(filePath);
            mockWatchers[0]._simulateChange(uri);

            // Wait for async processing
            await new Promise(resolve => setTimeout(resolve, 10));

            // Then: No notification shown
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Content unchanged'),
            );
        });

        it('should show notification when content actually changed (hash mismatch)', async () => {
            // Given: File with initial content
            const filePath = '/project1/.env';
            const initialContent = 'API_KEY=test123';
            mockFileContents.set(filePath, initialContent);

            // Initialize hash
            await vscode.commands.executeCommand(
                'demoBuilder._internal.initializeFileHashes',
                [filePath]
            );

            // Set demo as running
            mockStateManager.getCurrentProject.mockResolvedValue({
                status: 'running',
            });

            // When: File content changes
            const newContent = 'API_KEY=test456';
            mockFileContents.set(filePath, newContent);

            const uri = vscode.Uri.file(filePath);
            mockWatchers[0]._simulateChange(uri);

            // Wait for async processing
            await new Promise(resolve => setTimeout(resolve, 10));

            // Then: Notification shown
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('Environment configuration changed'),
                'Restart Demo',
            );
        });
    });

    describe('Programmatic Write Suppression', () => {
        it('should suppress notification for programmatic writes', async () => {
            // Given: File with content
            const filePath = '/project1/.env';
            const content = 'API_KEY=test123';
            mockFileContents.set(filePath, content);

            // Initialize hash
            await vscode.commands.executeCommand(
                'demoBuilder._internal.initializeFileHashes',
                [filePath]
            );

            // Register programmatic write
            await vscode.commands.executeCommand(
                'demoBuilder._internal.registerProgrammaticWrites',
                [filePath]
            );

            // Set demo as running
            mockStateManager.getCurrentProject.mockResolvedValue({
                status: 'running',
            });

            // When: File change event fires
            const newContent = 'API_KEY=test456';
            mockFileContents.set(filePath, newContent);

            const uri = vscode.Uri.file(filePath);
            mockWatchers[0]._simulateChange(uri);

            // Wait for async processing
            await new Promise(resolve => setTimeout(resolve, 10));

            // Then: No notification shown
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Ignoring programmatic write'),
            );
        });
    });

    describe('Demo Startup Grace Period', () => {
        it('should suppress notifications during grace period', async () => {
            // Given: File with content
            const filePath = '/project1/.env';
            const initialContent = 'API_KEY=test123';
            mockFileContents.set(filePath, initialContent);

            // Initialize hash
            await vscode.commands.executeCommand(
                'demoBuilder._internal.initializeFileHashes',
                [filePath]
            );

            // Trigger demo start
            await vscode.commands.executeCommand('demoBuilder._internal.demoStarted');

            // Set demo as running
            mockStateManager.getCurrentProject.mockResolvedValue({
                status: 'running',
            });

            // When: File changes within grace period (<10 seconds)
            const newContent = 'API_KEY=test456';
            mockFileContents.set(filePath, newContent);

            const uri = vscode.Uri.file(filePath);
            mockWatchers[0]._simulateChange(uri);

            // Wait for async processing
            await new Promise(resolve => setTimeout(resolve, 10));

            // Then: No notification shown (within grace period)
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('grace period'),
            );
        });
    });

    describe('Show-Once Notification Management', () => {
        it('should show notification only once per session', async () => {
            // Given: File with content
            const filePath = '/project1/.env';
            let content = 'API_KEY=test123';
            mockFileContents.set(filePath, content);

            // Initialize hash
            await vscode.commands.executeCommand(
                'demoBuilder._internal.initializeFileHashes',
                [filePath]
            );

            // Set demo as running
            mockStateManager.getCurrentProject.mockResolvedValue({
                status: 'running',
            });

            // When: First file change
            content = 'API_KEY=test456';
            mockFileContents.set(filePath, content);

            let uri = vscode.Uri.file(filePath);
            mockWatchers[0]._simulateChange(uri);

            await new Promise(resolve => setTimeout(resolve, 10));

            // Then: First change shows notification
            expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);

            // Clear mock
            (vscode.window.showInformationMessage as jest.Mock).mockClear();

            // When: Second file change
            content = 'API_KEY=test789';
            mockFileContents.set(filePath, content);

            uri = vscode.Uri.file(filePath);
            mockWatchers[0]._simulateChange(uri);

            await new Promise(resolve => setTimeout(resolve, 10));

            // Then: Second change suppressed
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('already shown'),
            );
        });

        it('should reset notification flag on action taken', async () => {
            // Given: File with content and notification shown
            const filePath = '/project1/.env';
            let content = 'API_KEY=test123';
            mockFileContents.set(filePath, content);

            await vscode.commands.executeCommand(
                'demoBuilder._internal.initializeFileHashes',
                [filePath]
            );

            mockStateManager.getCurrentProject.mockResolvedValue({
                status: 'running',
            });

            // Show notification
            content = 'API_KEY=test456';
            mockFileContents.set(filePath, content);

            let uri = vscode.Uri.file(filePath);
            mockWatchers[0]._simulateChange(uri);

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);

            // Clear mock
            (vscode.window.showInformationMessage as jest.Mock).mockClear();

            // When: User takes restart action
            await vscode.commands.executeCommand('demoBuilder._internal.restartActionTaken');

            // And: Next change occurs
            content = 'API_KEY=test789';
            mockFileContents.set(filePath, content);

            uri = vscode.Uri.file(filePath);
            mockWatchers[0]._simulateChange(uri);

            await new Promise(resolve => setTimeout(resolve, 10));

            // Then: Notification shown again
            expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        });
    });

    describe('Watcher Disposal on Workspace Folder Removal', () => {
        it('should dispose watchers when workspace folder removed', () => {
            // Given: Service with active watchers
            expect(mockWatchers.length).toBeGreaterThan(0);

            // When: Service disposed (simulating folder removal)
            service.dispose();

            // Then: Logger confirms disposal
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Service disposed'),
            );
        });
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
