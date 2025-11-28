/**
 * Shared test utilities for StateManager tests
 */

import { StateManager } from '@/core/state/stateManager';
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Project } from '@/types';

// Mock VS Code API
jest.mock('vscode');
jest.mock('fs/promises');
jest.mock('os');

// Mock Logger - StateManager uses Logger internally
const mockLoggerInstance = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    setOutputChannel: jest.fn(),
};

jest.mock('@/core/logging', () => ({
    Logger: jest.fn().mockImplementation(() => mockLoggerInstance),
    getLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    }),
}));

// Export mock logger for tests to verify calls
export { mockLoggerInstance };

export const mockHomedir = '/mock/home';
export const mockStateFile = path.join(mockHomedir, '.demo-builder', 'state.json');
export const mockRecentProjectsFile = path.join(mockHomedir, '.demo-builder', 'recent-projects.json');

export interface TestMocks {
    stateManager: StateManager;
    mockContext: vscode.ExtensionContext;
    mockGlobalState: vscode.Memento;
    mockWorkspaceState: vscode.Memento;
}

export function createMockProject(id?: string): Partial<Project> {
    return {
        id: id || 'test-project',
        path: '/test/project',
        name: 'Test Project',
        version: '1.0.0',
        created: new Date('2024-01-01T00:00:00.000Z'),
        lastModified: new Date('2024-01-02T00:00:00.000Z'),
        state: 'stopped',
        hasUnsavedChanges: false,
        components: [],
        openFiles: []
    } as Partial<Project>;
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
        setKeysForSync: jest.fn()
    } as unknown as vscode.Memento;

    // Create mock workspace state
    const mockWorkspaceState: vscode.Memento = {
        get: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
        keys: jest.fn().mockReturnValue([]),
        setKeysForSync: jest.fn()
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
        languageModelAccessInformation: {} as vscode.LanguageModelAccessInformation
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
        mockWorkspaceState
    };
}