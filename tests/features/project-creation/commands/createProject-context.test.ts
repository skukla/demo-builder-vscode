/**
 * CreateProjectWebviewCommand Context Variables Tests
 *
 * Tests for VS Code context variable updates when wizard opens/closes.
 * Context variables enable automatic view switching via `when` clauses.
 *
 * Step 4 of Projects Navigation Architecture plan.
 */

import {
    CreateProjectWebviewCommand,
} from './createProject.testUtils';
import * as vscode from 'vscode';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { internals } from '../../../helpers/commandInternals';
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({
            isAuthenticated: jest.fn(),
        })),
        getCommandExecutor: jest.fn(() => ({
            execute: jest.fn(),
        })),
        isSidebarInitialized: jest.fn(() => false),
        getSidebarProvider: jest.fn(() => ({
            updateContext: jest.fn(),
            clearWizardContext: jest.fn().mockResolvedValue(undefined),
        })),
    },
}));

import { lastMintedPanel, resetPanelState } from '../../../helpers/webviewCommandMocks';

/**
 * Create mock ExtensionContext
 */
function createMockExtensionContext(): vscode.ExtensionContext {
    return {
        subscriptions: [],
        extensionPath: '/mock/extension/path',
        globalState: {
            get: jest.fn(),
            update: jest.fn(),
            keys: jest.fn(() => []),
            setKeysForSync: jest.fn(),
        } as any,
        workspaceState: {
            get: jest.fn(),
            update: jest.fn(),
            keys: jest.fn(() => []),
        } as any,
        extensionUri: vscode.Uri.file('/mock/extension/path'),
        extensionMode: vscode.ExtensionMode.Test,
        environmentVariableCollection: {} as any,
        asAbsolutePath: (relativePath: string) => `/mock/extension/path/${relativePath}`,
        storageUri: undefined,
        globalStorageUri: vscode.Uri.file('/mock/storage'),
        logUri: vscode.Uri.file('/mock/logs'),
        storagePath: '/mock/storage',
        globalStoragePath: '/mock/global/storage',
        logPath: '/mock/logs',
        secrets: createMockSecretStorage().secrets,
        extension: {} as any,
        languageModelAccessInformation: {} as any,
    };
}

/**
 * Create mock Logger
 */

/**
 * Helper to create wizard command instance
 */
function createWizardCommand(): CreateProjectWebviewCommand {
    const mockContext = createMockExtensionContext();
    const mockStateManager = createMockStateManager();
    const mockLogger = createMockLogger();

    return new CreateProjectWebviewCommand(
        mockContext,
        mockStateManager,
        mockLogger
    );
}

describe('CreateProjectWebviewCommand - Context Variables', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetPanelState();
    });

    describe('execute()', () => {
        it('should set demoBuilder.wizardActive context to true when wizard opens successfully', async () => {
            // This test verifies that when execute() succeeds (no error), setContext is called.
            // Due to the complexity of mocking all wizard dependencies, we test this
            // by verifying the code path in the implementation directly.
            // The dispose() test below proves the context variable mechanism works correctly.

            // Given: A wizard command instance with mocked internal methods to prevent errors
            const command = createWizardCommand();

            // Mock the methods that normally throw to allow execution to proceed
            internals(command).createOrRevealPanel = jest.fn().mockResolvedValue(lastMintedPanel());
            internals(command).initializeCommunication = jest.fn().mockResolvedValue({
                on: jest.fn(),
                sendMessage: jest.fn().mockResolvedValue(undefined),
            });
            internals(command).updateSidebarWizardContext = jest.fn();

            // When: execute() is called (wizard opens)
            await command.execute();

            // Then: setContext should be called with wizardActive = true
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'setContext',
                'demoBuilder.wizardActive',
                true
            );
        });
    });

    describe('dispose()', () => {
        it('should set demoBuilder.wizardActive context to false when wizard closes', async () => {
            // Given: A wizard command that has been executed
            const command = createWizardCommand();
            await command.execute();

            // Clear executeCommand calls from execute()
            (vscode.commands.executeCommand as jest.Mock).mockClear();

            // When: dispose() is called (wizard closes)
            command.dispose();

            // Then: setContext should be called with wizardActive = false
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'setContext',
                'demoBuilder.wizardActive',
                false
            );
        });
    });
});
