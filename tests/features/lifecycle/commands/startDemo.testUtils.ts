/**
 * Shared setup for the StartDemoCommand suites.
 *
 * THIS FILE OWNS THE MOCKS AND THE SUT IMPORT. Specs import `StartDemoCommand`
 * (and the mock handles) from HERE, never from `@/features/...`, and declare no
 * `jest.mock` calls of their own.
 *
 * Why: `babel-plugin-jest-hoist` lifts `jest.mock` above the imports of the module
 * it appears in — not across modules. A spec importing the command directly could
 * load it before these mocks were registered, binding it to the real ProcessCleanup
 * and the real CommandExecutor. Re-exporting the command from here removes the
 * ordering question (`webview-test-authoring` §3; 59 precedents in this repo).
 *
 * Extracted 2026-08-30 (lane C1). The block below was byte-identical in
 * startDemo.lifecycle / .portConflict / .error — verified before it moved.
 * startDemo.concurrency declares no mocks and is deliberately untouched.
 *
 * Note the mocked `fs.promises.access` REJECTS by default: the command treats a
 * successful access as "the project directory is there". Tests that need it to
 * succeed override it themselves.
 */

import * as vscode from 'vscode';
import { ProcessCleanup } from '@/core/shell/processCleanup';

// Mock ProcessCleanup
jest.mock('@/core/shell/processCleanup');
const MockProcessCleanup = ProcessCleanup as jest.MockedClass<typeof ProcessCleanup>;

// Mock fs.promises for file access checks
jest.mock('fs', () => ({
    promises: {
        access: jest.fn().mockRejectedValue(new Error('ENOENT')),
    },
}));

// Mock ServiceLocator for CommandExecutor
const mockCommandExecutor = {
    execute: jest.fn(),
    isPortAvailable: jest.fn(),
};
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn(() => mockCommandExecutor),
        reset: jest.fn(),
    },
}));

// Mock logging

// The SUT, re-exported so specs never import it directly — see the header.
export { StartDemoCommand } from '@/features/lifecycle/commands/startDemo';

// The mocked collaborators the specs drive and assert against.
export { ProcessCleanup, MockProcessCleanup, mockCommandExecutor };

/**
 * The mocked `vscode` namespaces, as WRITABLE typed views.
 *
 * These suites replace members of the mocked module — `vscode.window.terminals`,
 * `createTerminal`, `withProgress` and so on. The real API declares them readonly,
 * correctly, so assignment needs a cast; the module here is a fake, so assigning is
 * the intended way to drive it.
 *
 * The cast lives HERE, once, naming exactly the members these suites write. It
 * replaced 28 separate `(vscode.window as any).x = …` — each of which disabled
 * checking of the entire statement to reach one member, so a misspelt name created a
 * new property and the test went on passing against nothing.
 */
export interface MockedVscodeWindow {
    terminals: vscode.Terminal[];
    createTerminal: jest.Mock;
    withProgress: jest.Mock;
    setStatusBarMessage: jest.Mock;
    showWarningMessage: jest.Mock;
    showInformationMessage: jest.Mock;
}

export const mockWindow = vscode.window as unknown as MockedVscodeWindow;
export const mockCommands = vscode.commands as unknown as { executeCommand: jest.Mock };
export const mockWorkspace = vscode.workspace as unknown as { getConfiguration: jest.Mock };
