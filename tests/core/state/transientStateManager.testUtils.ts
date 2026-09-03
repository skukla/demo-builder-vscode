/**
 * Shared test utilities for TransientStateManager tests
 */

import * as vscode from 'vscode';
import {
    createMockExtensionContext,
    createStatefulGlobalState,
} from '../../helpers/extensionContextFake';

// Mock VS Code API

/**
 * Creates a mock ExtensionContext with globalState for testing
 */
/**
 * RENAMED from `createTransientStateHarness` 2026-08-28: this returns a HARNESS
 * ({ context, globalState, setKeysForSyncMock }), not a context. Sharing the
 * name with four builders that do return a context is what made nineteen
 * different fixtures look like one duplicated helper.
 */
export function createTransientStateHarness(): {
    context: vscode.ExtensionContext;
    globalState: Map<string, unknown>;
    setKeysForSyncMock: jest.Mock;
} {
    const { globalState: memento, store: globalState } = createStatefulGlobalState();
    const setKeysForSyncMock = memento.setKeysForSync as jest.Mock;
    const context = createMockExtensionContext({ globalState: memento });

    return { context, globalState, setKeysForSyncMock };
}
