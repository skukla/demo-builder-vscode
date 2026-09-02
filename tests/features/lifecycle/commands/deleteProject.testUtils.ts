/**
 * Shared setup for the deleteProject suites — THE AGREED PART ONLY.
 *
 * This family does NOT agree about how to fake all of its dependencies, and
 * picking a winner would change what some suites exercise while every one of
 * them stayed green. So only the mocks that EVERY spec already declared
 * IDENTICALLY were moved here. Each spec keeps its own disputed mocks inline,
 * and therefore ends up with exactly the set it started with.
 *
 * Moved here (all specs agreed): @/core/logging, vscode
 * Left inline (specs disagree):  fs/promises
 *
 * Extracted 2026-08-30 (lane C2). Resolving the disputed ones is a separate
 * decision, deliberately not taken here.
 */

import { DeleteProjectCommand } from '@/features/lifecycle/commands/deleteProject';

// Mock VS Code API with proper types
jest.mock('vscode', () => ({
    window: {
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        withProgress: jest.fn(),
        setStatusBarMessage: jest.fn(),
    },
    commands: {
        executeCommand: jest.fn(),
    },
    ProgressLocation: {
        Notification: 15,
    },
}));
// Mock logging

export { DeleteProjectCommand };
export * as vscode from 'vscode';

import type * as vscodeTypes from 'vscode';
import type { StateManager } from '@/types/state';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import * as vscodeModule from 'vscode';

export interface DeleteProjectHarness {
    command: DeleteProjectCommand;
    mockContext: jest.Mocked<vscodeTypes.ExtensionContext>;
    mockStateManager: jest.Mocked<StateManager>;
    mockLogger: jest.Mocked<Logger>;
}

/**
 * The setup three of the four deleteProject suites share.
 *
 * The `fs/promises` doubles stay in the specs — the note above records that the
 * family disagrees about them, and it still does: the retry suite rejects
 * `access` with ENOENT and the others do not. Everything up to and including the
 * command construction is the same in all three.
 *
 * `showInformationMessage` resolves 'Yes' by default: deletion is confirmed
 * before it runs, and a suite that wants the refusal overrides it.
 *
 * @param projectPath - the project the state manager reports as current
 */
export function setupDeleteProject(projectPath: string): DeleteProjectHarness {
    const mockContext = createMockExtensionContext({
        extensionPath: '/mock/extension/path',
    }) as unknown as jest.Mocked<vscodeTypes.ExtensionContext>;

    const mockStateManager = createMockStateManager({
        getCurrentProject: jest.fn().mockResolvedValue({
            name: 'test-project',
            path: projectPath,
            status: 'stopped',
        }),
        clearProject: jest.fn().mockResolvedValue(undefined),
        removeFromRecentProjects: jest.fn().mockResolvedValue(undefined),
    }) as jest.Mocked<StateManager>;

    const mockLogger = createMockLogger() as jest.Mocked<Logger>;

    (vscodeModule.window.showInformationMessage as jest.Mock).mockResolvedValue('Yes');
    (vscodeModule.window.withProgress as jest.Mock).mockImplementation(
        async (_options: unknown, task: (p: unknown) => unknown) => task({ report: jest.fn() })
    );
    (vscodeModule.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);

    const command = new DeleteProjectCommand(mockContext, mockStateManager, mockLogger);
    return { command, mockContext, mockStateManager, mockLogger };
}
