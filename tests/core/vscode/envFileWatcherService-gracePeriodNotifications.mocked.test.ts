/**
 * EnvFileWatcherService - Grace Period and Notification Tests (Mocked)
 *
 * Tests demo startup grace period, show-once notification management,
 * and watcher disposal.
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

describe('EnvFileWatcherService - Grace Period and Notifications (Mocked)', () => {
    let mockContext: vscode.ExtensionContext;
    let mockWatcherManager: WorkspaceWatcherManager;
    let service: EnvFileWatcherService;

    beforeEach(() => {
        resetMocks();

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
});
