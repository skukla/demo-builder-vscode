/**
 * Shared test utilities for TransientStateManager tests
 */

import * as vscode from 'vscode';

// Mock VS Code API
jest.mock('vscode');

/**
 * Creates a mock ExtensionContext with globalState for testing
 */
export function createMockContext(): {
    context: vscode.ExtensionContext;
    globalState: Map<string, unknown>;
    setKeysForSyncMock: jest.Mock;
} {
    const globalState = new Map<string, unknown>();
    const setKeysForSyncMock = jest.fn();

    const context = {
        globalState: {
            get: <T>(key: string): T | undefined =>
                globalState.get(key) as T | undefined,
            update: async (key: string, value: unknown): Promise<void> => {
                if (value === undefined) {
                    globalState.delete(key);
                } else {
                    globalState.set(key, value);
                }
            },
            setKeysForSync: setKeysForSyncMock,
            keys: () => [...globalState.keys()],
        },
    } as unknown as vscode.ExtensionContext;

    return { context, globalState, setKeysForSyncMock };
}
