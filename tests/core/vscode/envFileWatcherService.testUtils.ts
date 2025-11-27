/**
 * Shared test utilities for EnvFileWatcherService tests
 *
 * Pattern: File System Mocking (Pattern 2)
 * Reference: .rptc/plans/resource-lifecycle-management/TESTING-MOCKING-PATTERNS.md
 */

import * as vscode from 'vscode';

// Mock logger FIRST (before any imports that might use it)
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

// Mock file system watchers
export const mockWatchers: any[] = [];
export let mockFileContents = new Map<string, string>();

// Track command callbacks
export const commandCallbacks: Record<string, Function> = {};

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
                        const { mockWatchers } = require('./envFileWatcherService.testUtils');
                        const idx = mockWatchers.indexOf(watcher);
                        if (idx !== -1) mockWatchers.splice(idx, 1);
                    }),
                    // Helper to simulate file change
                    _simulateChange: (uri: vscode.Uri) => {
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
export const mockRegisterWatcher = jest.fn();
jest.mock('@/core/vscode/workspaceWatcherManager', () => {
    return {
        WorkspaceWatcherManager: jest.fn().mockImplementation(() => ({
            registerWatcher: jest.fn(),
            dispose: jest.fn(),
        })),
    };
});

// Mock StateManager
export const mockStateManager = {
    getCurrentProject: jest.fn(),
};

// Mock logger
export const mockLogger = {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
};

/**
 * Reset all mocks and state
 */
export function resetMocks(): void {
    jest.clearAllMocks();
    mockWatchers.length = 0;
    mockFileContents.clear();
    Object.keys(commandCallbacks).forEach(key => delete commandCallbacks[key]);
}
