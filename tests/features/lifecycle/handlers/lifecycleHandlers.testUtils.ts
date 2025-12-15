/**
 * Shared Test Utilities for Lifecycle Handlers
 *
 * Common mocks, factories, and utilities used across lifecycle handler tests.
 */

import { HandlerContext } from '@/commands/handlers/HandlerContext';

// Mock VS Code
export const mockVSCode = {
    Uri: {
        file: jest.fn((path: string) => ({ fsPath: path, path })),
        parse: jest.fn((uri: string) => ({ fsPath: uri, path: uri }))
    },
    window: {
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn()
    },
    workspace: {
        updateWorkspaceFolders: jest.fn()
    },
    commands: {
        executeCommand: jest.fn()
    },
    env: {
        openExternal: jest.fn()
    }
};

/**
 * Creates a mock HandlerContext for testing
 *
 * CRITICAL: Returns a FUNCTION that creates fresh mocks, not a shared object.
 * This prevents test pollution from shared references.
 */
export function createMockContext() {
    // Mock component handler
    const mockComponentHandler = {
        handleMessage: jest.fn().mockResolvedValue(undefined)
    };

    // Mock webview panel
    const mockPanel = {
        dispose: jest.fn()
    };

    // Mock state manager - with proper jest mock types
    const mockStateManager = {
        getCurrentProject: jest.fn() as jest.MockedFunction<() => Promise<any>>
    };

    // Mock communication manager
    const mockCommunicationManager = {
        sendMessage: jest.fn().mockResolvedValue(undefined)
    };

    // Create mock context
    const context = {
        componentHandler: mockComponentHandler,
        panel: mockPanel,
        stateManager: mockStateManager,
        communicationManager: mockCommunicationManager,
        extensionPath: '/mock/extension/path',
        logger: {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn()
        } as any,
        debugLogger: {
            debug: jest.fn()
        } as any,
        sendMessage: jest.fn().mockResolvedValue(undefined),
        sharedState: {
            isAuthenticating: false,
            projectCreationAbortController: undefined
        }
    } as any;

    return context as jest.Mocked<HandlerContext>;
}

/**
 * Setup common mocks for lifecycle handler tests
 */
export function setupMocks() {
    jest.mock('vscode', () => mockVSCode, { virtual: true });
    jest.mock('@/core/validation/securityValidation');
    jest.mock('@/features/components/handlers/componentHandlers', () => ({
        handleLoadComponents: jest.fn().mockResolvedValue({
            success: true,
            data: { components: [] }
        })
    }));
}
