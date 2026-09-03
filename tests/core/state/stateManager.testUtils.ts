/**
 * Shared test utilities for StateManager tests
 */

import { StateManager } from '@/core/state/stateManager';
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Project } from '@/types/base';
import { createMockProject as createMockProjectBase } from '../../helpers/projectFake';

// Mock VS Code API
jest.mock('fs/promises');
jest.mock('os');

// Mock Logger - StateManager uses getLogger() internally
// A jest.mock factory is hoisted above the imports, so it cannot reference an
// imported builder — but the factory BODY runs lazily, so a require() inside it
// reaches the shared builder. `__mockLoggerInstance` is not an export of the real
// module; it is this helper's handle on the same instance the SUT receives.
jest.mock('@/core/logging/debugLogger', () => {
    const { createMockLogger } = require('../../helpers/loggerFake');
    const mockLogger = createMockLogger();
    return {
        getLogger: jest.fn(() => mockLogger),
        __mockLoggerInstance: mockLogger, // Export for tests to access
    };
});

// Access the mock logger instance via the mocked module
type MockLoggerShape = {
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
    trace: jest.Mock;
};
const loggingModule = jest.requireMock('@/core/logging/debugLogger') as {
    __mockLoggerInstance: MockLoggerShape;
};
export const mockLoggerInstance = loggingModule.__mockLoggerInstance;

export const mockHomedir = '/mock/home';
export const mockStateFile = path.join(mockHomedir, '.demo-builder', 'state.json');
export const mockRecentProjectsFile = path.join(
    mockHomedir,
    '.demo-builder',
    'recent-projects.json'
);

export interface TestMocks {
    stateManager: StateManager;
    mockContext: vscode.ExtensionContext;
    mockGlobalState: vscode.Memento;
    mockWorkspaceState: vscode.Memento;
}

/**
 * @param _label - accepted so the callers that pass one keep compiling. It used
 *   to land on an `id` field that `Project` never declared (with `version`,
 *   `state`, `hasUnsavedChanges`, `components`, `openFiles` — all invented, all
 *   hidden by an `as never`), and nothing ever read any of them.
 */
export function createStateManagerProject(_label?: string): Project {
    return createMockProjectBase({
        path: '/test/project',
        name: 'Test Project',
        created: new Date('2024-01-01T00:00:00.000Z'),
        lastModified: new Date('2024-01-02T00:00:00.000Z'),
    });
}

export function setupMocks(): TestMocks {
    jest.clearAllMocks();

    // Clear mock logger calls
    mockLoggerInstance.info.mockClear();
    mockLoggerInstance.warn.mockClear();
    mockLoggerInstance.error.mockClear();
    mockLoggerInstance.debug.mockClear();

    // Mock os.homedir
    (os.homedir as jest.Mock).mockReturnValue(mockHomedir);

    // Create mock global state
    const mockGlobalState: vscode.Memento = {
        get: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
        keys: jest.fn().mockReturnValue([]),
        setKeysForSync: jest.fn(),
    } as unknown as vscode.Memento;

    // Create mock workspace state
    const mockWorkspaceState: vscode.Memento = {
        get: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
        keys: jest.fn().mockReturnValue([]),
        setKeysForSync: jest.fn(),
    } as unknown as vscode.Memento;

    // Create mock context
    const mockContext = {
        globalState: mockGlobalState,
        workspaceState: mockWorkspaceState,
        subscriptions: [],
        extensionPath: '/test/path',
        storagePath: '/test/storage',
        globalStoragePath: '/test/global-storage',
        logPath: '/test/log',
        extensionUri: vscode.Uri.file('/test/path'),
        storageUri: vscode.Uri.file('/test/storage'),
        globalStorageUri: vscode.Uri.file('/test/global-storage'),
        logUri: vscode.Uri.file('/test/log'),
        extensionMode: vscode.ExtensionMode.Production,
        asAbsolutePath: (relativePath: string) => `/test/path/${relativePath}`,
        secrets: {} as vscode.SecretStorage,
        environmentVariableCollection: {} as vscode.GlobalEnvironmentVariableCollection,
        extension: {} as vscode.Extension<any>,
        languageModelAccessInformation: {} as vscode.LanguageModelAccessInformation,
    } as unknown as vscode.ExtensionContext;

    // Mock fs functions
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    (fs.access as jest.Mock).mockResolvedValue(undefined);
    (fs.unlink as jest.Mock).mockResolvedValue(undefined);
    (fs.readdir as jest.Mock).mockResolvedValue([]);
    (fs.stat as jest.Mock).mockResolvedValue({ mtime: new Date() });

    // Create StateManager instance
    const stateManager = new StateManager(mockContext);

    return {
        stateManager,
        mockContext,
        mockGlobalState,
        mockWorkspaceState,
    };
}
