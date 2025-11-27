import { HandlerContext } from '@/commands/handlers/HandlerContext';
import * as validation from '@/core/validation';
import * as executor from '@/features/project-creation/handlers/executor';
import * as promiseUtils from '@/core/utils/promiseUtils';
import { ServiceLocator } from '@/core/di';
import * as vscode from 'vscode';
import * as fs from 'fs';

/**
 * Shared test utilities for createHandler tests
 */

export interface MockCommandExecutor {
    execute: jest.Mock;
}

export interface TestSetup {
    mockContext: jest.Mocked<HandlerContext>;
    mockCommandExecutor: MockCommandExecutor;
}

/**
 * Creates a mock HandlerContext with sensible defaults
 */
export function createMockContext(overrides?: Partial<HandlerContext>): jest.Mocked<HandlerContext> {
    return {
        sendMessage: jest.fn().mockResolvedValue(undefined),
        logger: {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
        } as any,
        context: {
            globalState: {
                get: jest.fn().mockReturnValue(false),
                update: jest.fn().mockResolvedValue(undefined),
            },
        } as any,
        stateManager: {
            getAllProjects: jest.fn().mockResolvedValue([]) as jest.MockedFunction<any>,
            getCurrentProject: jest.fn().mockResolvedValue(undefined) as jest.MockedFunction<any>,
            saveProject: jest.fn().mockResolvedValue(undefined) as jest.MockedFunction<any>,
            clearProject: jest.fn().mockResolvedValue(undefined) as jest.MockedFunction<any>,
        } as any,
        sharedState: {
            projectCreationAbortController: undefined,
            meshCreatedForWorkspace: undefined,
            meshExistedBeforeSession: undefined,
        },
        ...overrides,
    } as any;
}

/**
 * Standard test configuration object
 */
export const mockConfig = {
    projectName: 'test-project',
    components: {
        frontend: 'react-app',
        backend: 'nodejs',
    },
};

/**
 * Sets up all common mocks with default behavior
 * Call this in beforeEach() of each test file
 */
export function setupDefaultMocks(): MockCommandExecutor {
    jest.clearAllMocks();

    // Mock CommandExecutor
    const mockCommandExecutor: MockCommandExecutor = {
        execute: jest.fn().mockResolvedValue({ code: 0, stdout: 'success', stderr: '' }),
    };
    (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockCommandExecutor);

    // Mock validation
    (validation.validateProjectNameSecurity as jest.Mock).mockImplementation(() => {});

    // Mock executor
    (executor.executeProjectCreation as jest.Mock).mockResolvedValue(undefined);

    // Mock promiseUtils.withTimeout to just execute the promise
    (promiseUtils.withTimeout as jest.Mock).mockImplementation(async (promise) => promise);

    // Mock vscode
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);
    (vscode.workspace as any).isTrusted = true;

    // Mock fs
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    return mockCommandExecutor;
}

/**
 * Configures mocks for a validation error scenario
 */
export function mockValidationError(errorMessage: string): void {
    (validation.validateProjectNameSecurity as jest.Mock).mockImplementation(() => {
        throw new Error(errorMessage);
    });
}

/**
 * Configures mocks for a timeout scenario
 */
export function mockTimeout(timeoutMessage = 'Project creation timed out after 30 minutes'): void {
    (promiseUtils.withTimeout as jest.Mock).mockRejectedValue(new Error(timeoutMessage));
}

/**
 * Configures mocks for a cancellation scenario
 */
export function mockCancellation(): void {
    (executor.executeProjectCreation as jest.Mock).mockRejectedValue(
        new Error('Operation cancelled by user')
    );
}

/**
 * Configures mocks for a general failure scenario
 */
export function mockExecutionFailure(errorMessage: string): void {
    (executor.executeProjectCreation as jest.Mock).mockRejectedValue(new Error(errorMessage));
}

/**
 * Configures mocks for workspace trust scenarios
 */
export function mockUntrustedWorkspace(tipAlreadyShown = false): jest.Mock {
    (vscode.workspace as any).isTrusted = false;
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

    // Return function that gets current mock implementation
    const getTipShown = () => tipAlreadyShown;

    // Create mock that calls the function
    const getMock = jest.fn().mockImplementation((key: string, defaultValue: boolean) => {
        if (key === 'demoBuilder.trustTipShown') {
            return getTipShown();
        }
        return defaultValue;
    });

    return getMock;
}

/**
 * Configures mocks for mesh cleanup scenarios
 */
export function setupMeshCleanupScenario(
    context: jest.Mocked<HandlerContext>,
    meshExistedBefore: boolean
): void {
    context.sharedState.meshCreatedForWorkspace = 'workspace-123';
    context.sharedState.meshExistedBeforeSession = meshExistedBefore ? 'workspace-123' : undefined;
}

/**
 * Configures mocks for project directory cleanup
 */
export function mockProjectDirectoryExists(exists = true): void {
    (fs.existsSync as jest.Mock).mockReturnValue(exists);
}
