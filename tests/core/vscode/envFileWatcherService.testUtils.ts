/**
 * Shared test utilities for EnvFileWatcherService tests
 *
 * Pattern: File System Mocking (Pattern 2)
 * Reference: .rptc/plans/resource-lifecycle-management/TESTING-MOCKING-PATTERNS.md
 */

import { createMockLogger } from '../../helpers/loggerFake';
import { createMockStateManager } from '../../helpers/stateManagerFake';

// Mock logger FIRST (before any imports that might use it)

// Mock file system watchers
export const mockWatchers: any[] = [];
export const mockFileContents = new Map<string, string>();

// Track command callbacks
export const commandCallbacks: Record<string, (...args: unknown[]) => unknown> = {};

// Mock vscode API
jest.mock('vscode', () => {
    const actual = jest.requireActual('vscode');
    return {
        ...actual,
        workspace: {
            workspaceFolders: [
                { uri: { fsPath: '/project1', toString: () => 'file:///project1' }, name: 'project1', index: 0 },
            ],
            createFileSystemWatcher: (
                require('./recordingFileWatcher') as typeof import('./recordingFileWatcher')
            ).createRecordingWatcherFactory(() => mockWatchers)
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
export const mockStateManager = createMockStateManager({
    getCurrentProject: jest.fn(),
});

// Mock logger
export const mockLogger = createMockLogger();

/**
 * Reset all mocks and state
 */
export function resetMocks(): void {
    jest.clearAllMocks();
    mockWatchers.length = 0;
    mockFileContents.clear();
    Object.keys(commandCallbacks).forEach(key => delete commandCallbacks[key]);
}

// ── The SUT and its collaborators, re-exported ──────────────────────────────
// Specs MUST import these from here, never from '@/core/vscode/...'. jest.mock
// hoists above the imports of the module it appears in, NOT across modules, so a
// spec importing the service directly could load it before the mocks above were
// registered — which is exactly why all three .mocked specs used to re-declare
// every mock in this file. Re-exporting removes the ordering question.
export { EnvFileWatcherService } from '@/core/vscode/envFileWatcherService';
export { WorkspaceWatcherManager } from '@/core/vscode/workspaceWatcherManager';
export * as vscode from 'vscode';
