/**
 * The canonical `vscode.ExtensionContext` fake (ADR-016 § Fixtures).
 *
 * Five builders shared the names `createMockContext` / `makeContext` while
 * building genuinely different things: one takes a globalState, one takes a
 * version and carries packageJSON, one deliberately makes `secrets.get` resolve
 * undefined for every key (documented, from a real incident), and one did not
 * return a context at all — it returned a harness tuple, and has been renamed.
 *
 * The field set below is taken from the FULLEST of them (the activation
 * harness in `tests/extension.testUtils.ts`) rather than the thinnest. That
 * direction matters: a first draft of this file carried only the fields the
 * caller in front of me needed, and activation blew up on `logUri.fsPath` the
 * moment a richer consumer adopted it. A canonical fixture that is thinner than
 * the fake it replaces is not canonical; it is a regression with a nice name.
 *
 * Suites keep their own specifics and pass them as overrides.
 */

import * as vscode from 'vscode';

/**
 * `vscode.Uri` is ABSENT in suites that mock the module thinly, and this fixture
 * is shared across all of them. Reaching for it unconditionally broke three
 * updateManager suites the moment they adopted this file — so the Uri-shaped
 * fields degrade to a plain `{ fsPath }` rather than throwing.
 */
function uri(p: string): unknown {
    const U = (vscode as { Uri?: { file(p: string): unknown } }).Uri;
    return U?.file ? U.file(p) : { fsPath: p, path: p, scheme: 'file' };
}

/**
 * @param overrides - anything this suite genuinely needs different.
 * @param basePath - convenience for the several paths that move together.
 */
export function createMockExtensionContext(
    overrides: Partial<vscode.ExtensionContext> = {},
    basePath = '/test/extension/path'
): vscode.ExtensionContext {
    return {
        subscriptions: [],
        extensionPath: basePath,
        globalState: {
            get: jest.fn(),
            update: jest.fn(),
            keys: jest.fn(() => []),
            setKeysForSync: jest.fn(),
        },
        workspaceState: { get: jest.fn(), update: jest.fn(), keys: jest.fn(() => []) },
        extensionUri: uri(basePath),
        extensionMode: (vscode as { ExtensionMode?: { Test: number } }).ExtensionMode?.Test ?? 2,
        environmentVariableCollection: {},
        asAbsolutePath: (relativePath: string) => `${basePath}/${relativePath}`,
        storageUri: undefined,
        globalStorageUri: uri('/mock/storage'),
        logUri: uri('/mock/logs'),
        storagePath: '/mock/storage',
        globalStoragePath: '/mock/global/storage',
        logPath: '/mock/logs',
        secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn(), onDidChange: jest.fn() },
        extension: { packageJSON: { version: '1.0.0' } },
        languageModelAccessInformation: {},
        ...overrides,
    } as unknown as vscode.ExtensionContext;
}
