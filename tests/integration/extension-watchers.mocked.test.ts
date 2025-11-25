/**
 * Integration Test: EnvFileWatcherService with WorkspaceWatcherManager
 *
 * Tests the integration between EnvFileWatcherService and WorkspaceWatcherManager
 * with mocked file system operations.
 *
 * Pattern: Integration testing with mocked resources
 */

import * as vscode from 'vscode';
import { EnvFileWatcherService } from '@/core/vscode/envFileWatcherService';
import { WorkspaceWatcherManager } from '@/core/vscode/workspaceWatcherManager';

// Mock file system watchers
const mockWatchers: any[] = [];

// Mock vscode API
jest.mock('vscode', () => {
    const actual = jest.requireActual('vscode');
    return {
        ...actual,
        workspace: {
            workspaceFolders: [
                { uri: { fsPath: '/workspace1', toString: () => 'file:///workspace1' }, name: 'workspace1', index: 0 },
                { uri: { fsPath: '/workspace2', toString: () => 'file:///workspace2' }, name: 'workspace2', index: 1 },
            ],
            createFileSystemWatcher: jest.fn((pattern: string) => {
                const watcher = {
                    pattern,
                    _disposed: false,
                    onDidCreate: jest.fn(() => ({ dispose: () => {} })),
                    onDidChange: jest.fn(() => ({ dispose: () => {} })),
                    onDidDelete: jest.fn(() => ({ dispose: () => {} })),
                    dispose: jest.fn(() => {
                        watcher._disposed = true;
                        const idx = mockWatchers.indexOf(watcher);
                        if (idx !== -1) mockWatchers.splice(idx, 1);
                    })
                };

                mockWatchers.push(watcher);
                return watcher;
            })
        },
        window: {
            showInformationMessage: jest.fn(),
        },
        commands: {
            registerCommand: jest.fn((id, callback) => ({
                dispose: jest.fn(),
            })),
            executeCommand: jest.fn(),
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
        readFile: jest.fn(() => Promise.reject(new Error('File not found'))),
    },
}));

// Mock logger
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

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

describe('Integration: EnvFileWatcherService + WorkspaceWatcherManager', () => {
    let mockContext: vscode.ExtensionContext;
    let watcherManager: WorkspaceWatcherManager;
    let envWatcherService: EnvFileWatcherService;

    beforeEach(() => {
        jest.clearAllMocks();
        mockWatchers.length = 0;

        mockContext = {
            subscriptions: [],
            extensionPath: '/test',
        } as any;

        // Create real WorkspaceWatcherManager
        watcherManager = new WorkspaceWatcherManager();

        // Create EnvFileWatcherService using real WorkspaceWatcherManager
        envWatcherService = new EnvFileWatcherService(
            mockContext,
            mockStateManager as any,
            watcherManager,
            mockLogger,
        );
    });

    afterEach(() => {
        envWatcherService?.dispose();
        watcherManager?.dispose();
    });

    describe('Watcher Creation via WorkspaceWatcherManager', () => {
        it('should create watchers for workspace folders via manager', () => {
            // When: Service initialized
            envWatcherService.initialize();

            // Then: Watchers created for both workspace folders
            expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(2);
            expect(mockWatchers).toHaveLength(2);
        });

        it('should register watchers with WorkspaceWatcherManager', () => {
            // Given: Service initialized
            envWatcherService.initialize();

            // Then: WorkspaceWatcherManager should have 2 watchers
            expect(watcherManager.getWatcherCount()).toBe(2);
        });
    });

    describe('Watcher Disposal via WorkspaceWatcherManager', () => {
        it('should dispose watchers when workspace folder removed', () => {
            // Given: Service initialized with watchers
            envWatcherService.initialize();

            const initialCount = watcherManager.getWatcherCount();
            expect(initialCount).toBe(2);

            // When: Remove first workspace folder
            const folder1 = vscode.workspace.workspaceFolders![0];
            watcherManager.removeWatchersForFolder(folder1);

            // Then: Watcher count reduced by 1
            expect(watcherManager.getWatcherCount()).toBe(1);
        });

        it('should dispose all watchers when manager disposed', () => {
            // Given: Service initialized with watchers
            envWatcherService.initialize();

            expect(watcherManager.getWatcherCount()).toBe(2);
            expect(mockWatchers).toHaveLength(2);

            // When: Manager disposed
            watcherManager.dispose();

            // Then: All watchers disposed
            expect(mockWatchers).toHaveLength(0);
            expect(watcherManager.getWatcherCount()).toBe(0);
        });
    });

    describe('Service and Manager Lifecycle Integration', () => {
        it('should handle service disposal without breaking manager', () => {
            // Given: Service initialized
            envWatcherService.initialize();

            expect(watcherManager.getWatcherCount()).toBe(2);

            // When: Service disposed (but not manager)
            envWatcherService.dispose();

            // Then: Manager still functional
            const folder = vscode.workspace.workspaceFolders![0];
            const watcher = watcherManager.createWatcher(folder, '**/*.json');

            expect(watcher).toBeDefined();
            expect(watcherManager.getWatcherCount()).toBe(3); // 2 original + 1 new
        });

        it('should handle manager disposal cleaning up service watchers', () => {
            // Given: Service initialized
            envWatcherService.initialize();

            expect(watcherManager.getWatcherCount()).toBe(2);

            // When: Manager disposed first
            watcherManager.dispose();

            // Then: All watchers cleaned up
            expect(mockWatchers).toHaveLength(0);

            // Service disposal should be safe
            expect(() => envWatcherService.dispose()).not.toThrow();
        });
    });

    describe('Workspace Change Events Integration', () => {
        it('should handle adding new workspace folder', () => {
            // Given: Service initialized
            envWatcherService.initialize();

            const initialCount = watcherManager.getWatcherCount();

            // When: New workspace folder added (simulated)
            const newFolder = {
                uri: { fsPath: '/workspace3', toString: () => 'file:///workspace3' },
                name: 'workspace3',
                index: 2
            } as vscode.WorkspaceFolder;

            const watcher = watcherManager.createWatcher(newFolder, '**/.env');

            // Then: New watcher created
            expect(watcherManager.getWatcherCount()).toBe(initialCount + 1);
            expect(watcher).toBeDefined();
        });

        it('should handle removing workspace folder', () => {
            // Given: Service initialized
            envWatcherService.initialize();

            const folder = vscode.workspace.workspaceFolders![0];
            const initialCount = watcherManager.getWatcherCount();

            // When: Workspace folder removed
            watcherManager.removeWatchersForFolder(folder);

            // Then: Watcher for that folder removed
            expect(watcherManager.getWatcherCount()).toBe(initialCount - 1);
        });
    });
});
