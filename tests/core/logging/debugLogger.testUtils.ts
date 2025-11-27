/**
 * Shared test utilities for DebugLogger tests
 *
 * Provides mock LogOutputChannels and setup functions for testing
 * the dual-channel logging system.
 */

import * as vscode from 'vscode';

// Mock LogOutputChannel for User Logs channel
export const mockLogsChannel = {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    append: jest.fn(),
    appendLine: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    clear: jest.fn(),
    dispose: jest.fn(),
    name: 'Demo Builder: User Logs',
    logLevel: 2, // Info level
};

// Mock LogOutputChannel for Debug Logs channel
export const mockDebugChannel = {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    append: jest.fn(),
    appendLine: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    clear: jest.fn(),
    dispose: jest.fn(),
    name: 'Demo Builder: Debug Logs',
    logLevel: 0, // Trace level
};

// Override the vscode mock for createOutputChannel to return appropriate channel
jest.mock('vscode', () => {
    const originalModule = jest.requireActual('../../__mocks__/vscode');
    return {
        ...originalModule,
        window: {
            ...originalModule.window,
            createOutputChannel: jest.fn((name: string, options?: { log: boolean }) => {
                if (options?.log) {
                    // Return appropriate mock based on channel name
                    if (name === 'Demo Builder: User Logs') {
                        return mockLogsChannel;
                    } else if (name === 'Demo Builder: Debug Logs') {
                        return mockDebugChannel;
                    }
                }
                // Fallback for non-log channels
                return {
                    append: jest.fn(),
                    appendLine: jest.fn(),
                    clear: jest.fn(),
                    show: jest.fn(),
                    hide: jest.fn(),
                    dispose: jest.fn(),
                    name,
                };
            }),
        },
        workspace: {
            ...originalModule.workspace,
            getConfiguration: jest.fn().mockReturnValue({
                get: jest.fn().mockReturnValue(true), // debugEnabled = true
            }),
        },
    };
});

/**
 * Creates a mock ExtensionContext for testing
 */
export function createMockContext(): vscode.ExtensionContext {
    return {
        subscriptions: [],
        extensionPath: '/test/path',
        storagePath: '/test/storage',
        globalStoragePath: '/test/global-storage',
        logPath: '/test/logs',
        extensionUri: vscode.Uri.file('/test/path'),
        globalStorageUri: vscode.Uri.file('/test/global-storage'),
        storageUri: vscode.Uri.file('/test/storage'),
        logUri: vscode.Uri.file('/test/logs'),
        extensionMode: vscode.ExtensionMode.Development,
        asAbsolutePath: jest.fn((p: string) => `/test/path/${p}`),
        workspaceState: {
            get: jest.fn(),
            update: jest.fn(),
            keys: jest.fn().mockReturnValue([]),
        },
        globalState: {
            get: jest.fn(),
            update: jest.fn(),
            keys: jest.fn().mockReturnValue([]),
            setKeysForSync: jest.fn(),
        },
        secrets: {
            get: jest.fn(),
            store: jest.fn(),
            delete: jest.fn(),
            onDidChange: jest.fn(),
        },
        environmentVariableCollection: {} as vscode.GlobalEnvironmentVariableCollection,
        extension: {} as vscode.Extension<unknown>,
        languageModelAccessInformation: {} as vscode.LanguageModelAccessInformation,
    } as unknown as vscode.ExtensionContext;
}

/**
 * Resets all mock functions for a clean test state
 */
export function resetMocks(): void {
    jest.clearAllMocks();

    // Restore default mock for workspace.getConfiguration
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue(true), // debugEnabled = true by default
    });
}
