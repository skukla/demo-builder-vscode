/**
 * Fully Mocked Tests for WorkspaceWatcherManager
 *
 * These tests use mocked resources (no real file watchers)
 * to avoid crashing Cursor IDE. Safe for rapid iteration in IDE.
 *
 * Pattern: File Watcher Mocking (Pattern 2)
 * Reference: .rptc/plans/resource-lifecycle-management/TESTING-MOCKING-PATTERNS.md
 */

import * as vscode from 'vscode';
import { WorkspaceWatcherManager } from '@/core/vscode/workspaceWatcherManager';

// Mock vscode.workspace.createFileSystemWatcher
const mockWatchers: any[] = [];

jest.mock('vscode', () => {
    const original = jest.requireActual('vscode');
    return {
        ...original,
        workspace: {
            ...original.workspace,
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
                    })
                };

                mockWatchers.push(watcher);
                return watcher;
            })
        }
    };
});

// Mock logger
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

describe('WorkspaceWatcherManager', () => {
    let manager: WorkspaceWatcherManager;

    beforeEach(() => {
        manager = new WorkspaceWatcherManager();
        mockWatchers.length = 0;
        jest.clearAllMocks();
    });

    afterEach(() => {
        manager.dispose();
    });

    describe('Watcher Creation', () => {
        it('should create watcher for workspace folder', () => {
            // Given: Workspace folder
            const workspaceFolder = {
                uri: vscode.Uri.file('/workspace'),
                name: 'test-workspace',
                index: 0
            };

            // When: createWatcher called
            const watcher = manager.createWatcher(workspaceFolder, '**/.env');

            // Then: Watcher created
            expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledWith('**/.env');
            expect(mockWatchers).toHaveLength(1);
            expect(watcher).toBeDefined();
        });

        it('should prevent duplicate watchers for same folder and pattern', () => {
            // Given: Workspace folder
            const workspaceFolder = {
                uri: vscode.Uri.file('/workspace'),
                name: 'test-workspace',
                index: 0
            };

            // When: createWatcher called twice with same folder and pattern
            const watcher1 = manager.createWatcher(workspaceFolder, '**/.env');
            const watcher2 = manager.createWatcher(workspaceFolder, '**/.env');

            // Then: Only one watcher created, same instance returned
            expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(1);
            expect(watcher1).toBe(watcher2); // Same instance returned
            expect(mockWatchers).toHaveLength(1);
        });

        it('should allow multiple patterns for same folder', () => {
            // Given: Workspace folder
            const workspaceFolder = {
                uri: vscode.Uri.file('/workspace'),
                name: 'test-workspace',
                index: 0
            };

            // When: createWatcher called with different patterns
            manager.createWatcher(workspaceFolder, '**/.env');
            manager.createWatcher(workspaceFolder, '**/*.json');

            // Then: Two separate watchers created
            expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(2);
            expect(mockWatchers).toHaveLength(2);
        });
    });

    describe('Watcher Disposal', () => {
        it('should dispose watcher when workspace folder removed', () => {
            // Given: Watchers for two workspace folders
            const folder1 = {
                uri: vscode.Uri.file('/workspace1'),
                name: 'workspace1',
                index: 0
            };
            const folder2 = {
                uri: vscode.Uri.file('/workspace2'),
                name: 'workspace2',
                index: 1
            };

            manager.createWatcher(folder1, '**/.env');
            const watcher2 = manager.createWatcher(folder2, '**/.env');

            // When: Remove folder1
            manager.removeWatchersForFolder(folder1);

            // Then: Only watcher2 remains
            expect(mockWatchers).toHaveLength(1);
            expect(mockWatchers[0]).toBe(watcher2);
        });

        it('should dispose all watchers on manager disposal', () => {
            // Given: Watchers for multiple folders
            const folder1 = {
                uri: vscode.Uri.file('/workspace1'),
                name: 'workspace1',
                index: 0
            };
            const folder2 = {
                uri: vscode.Uri.file('/workspace2'),
                name: 'workspace2',
                index: 1
            };

            manager.createWatcher(folder1, '**/.env');
            manager.createWatcher(folder2, '**/.env');

            expect(mockWatchers).toHaveLength(2);

            // When: Manager disposed
            manager.dispose();

            // Then: All watchers disposed
            expect(mockWatchers).toHaveLength(0);
        });

        it('should prevent creating watchers after disposal', () => {
            // Given: Disposed manager
            manager.dispose();

            const workspaceFolder = {
                uri: vscode.Uri.file('/workspace'),
                name: 'test-workspace',
                index: 0
            };

            // When/Then: Creating watcher should throw
            expect(() => {
                manager.createWatcher(workspaceFolder, '**/.env');
            }).toThrow(/disposed/i);
        });
    });

    describe('Event Listeners', () => {
        it('should register onCreate listener', () => {
            // Given: Workspace folder
            const workspaceFolder = {
                uri: vscode.Uri.file('/workspace'),
                name: 'test-workspace',
                index: 0
            };

            // When: Create watcher and register onCreate listener
            const watcher = manager.createWatcher(workspaceFolder, '**/.env');
            const listener = jest.fn();

            watcher.onDidCreate(listener);

            // Then: onCreate listener registered
            expect(mockWatchers[0].onDidCreate).toHaveBeenCalledWith(listener);
        });

        it('should trigger event listeners', () => {
            // Given: Workspace folder with onCreate and onChange listeners
            const workspaceFolder = {
                uri: vscode.Uri.file('/workspace'),
                name: 'test-workspace',
                index: 0
            };

            const watcher = manager.createWatcher(workspaceFolder, '**/.env');
            const createListener = jest.fn();
            const changeListener = jest.fn();

            watcher.onDidCreate(createListener);
            watcher.onDidChange(changeListener);

            // When: Simulate file creation
            const mockUri = vscode.Uri.file('/workspace/.env');
            mockWatchers[0]._listeners.onCreate.forEach((l: Function) => l(mockUri));

            // Then: Only onCreate listener triggered
            expect(createListener).toHaveBeenCalledWith(mockUri);
            expect(changeListener).not.toHaveBeenCalled();
        });
    });

    describe('Diagnostics', () => {
        it('should return correct watcher count', () => {
            // Given: Empty manager
            expect(manager.getWatcherCount()).toBe(0);

            // When: Create 3 watchers
            const folder1 = {
                uri: vscode.Uri.file('/workspace1'),
                name: 'workspace1',
                index: 0
            };
            const folder2 = {
                uri: vscode.Uri.file('/workspace2'),
                name: 'workspace2',
                index: 1
            };

            manager.createWatcher(folder1, '**/.env');
            manager.createWatcher(folder1, '**/*.json');
            manager.createWatcher(folder2, '**/.env');

            // Then: Count should be 3
            expect(manager.getWatcherCount()).toBe(3);
        });

        it('should return watchers for specific folder', () => {
            // Given: Watchers for multiple folders
            const folder1 = {
                uri: vscode.Uri.file('/workspace1'),
                name: 'workspace1',
                index: 0
            };
            const folder2 = {
                uri: vscode.Uri.file('/workspace2'),
                name: 'workspace2',
                index: 1
            };

            manager.createWatcher(folder1, '**/.env');
            manager.createWatcher(folder1, '**/*.json');
            manager.createWatcher(folder2, '**/.env');

            // When: Get watchers for folder1
            const folder1Watchers = manager.getWatchersForFolder(folder1);

            // Then: Should return 2 watchers
            expect(folder1Watchers).toHaveLength(2);
        });

        it('should return empty array for folder with no watchers', () => {
            // Given: Folder with no watchers
            const folder = {
                uri: vscode.Uri.file('/workspace-no-watchers'),
                name: 'workspace-no-watchers',
                index: 2
            };

            // When: Get watchers for folder
            const watchers = manager.getWatchersForFolder(folder);

            // Then: Should return empty array
            expect(watchers).toEqual([]);
        });
    });
});
