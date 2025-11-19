/**
 * HandlerRegistry Test Utilities
 *
 * Shared mocks, factories, and utilities for HandlerRegistry tests
 */

import { HandlerContext } from '@/commands/handlers/HandlerContext';

/**
 * Creates a mock HandlerContext for testing
 * Returns a function to ensure fresh instances (closure semantics)
 */
export function createMockContext(): jest.Mocked<HandlerContext> {
    return {
        logger: {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn()
        },
        debugLogger: {
            debug: jest.fn(),
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn()
        },
        sendMessage: jest.fn(),
        sharedState: {
            isAuthenticating: false
        }
    } as any;
}

/**
 * Sets up all handler mocks with default implementations
 * Should be called in beforeEach to ensure clean state
 */
export function setupHandlerMocks(): void {
    const lifecycle = require('@/features/lifecycle/handlers/lifecycleHandlers');
    const prerequisites = require('@/features/prerequisites/handlers');
    const components = require('@/features/components/handlers/componentHandlers');
    const auth = require('@/features/authentication/handlers/authenticationHandlers');
    const projects = require('@/features/authentication/handlers/projectHandlers');
    const workspaces = require('@/features/authentication/handlers/workspaceHandlers');
    const mesh = require('@/features/mesh/handlers');
    const creation = require('@/features/project-creation/handlers');

    // Lifecycle handlers
    (lifecycle.handleReady as jest.Mock).mockResolvedValue({ success: true });
    (lifecycle.handleCancel as jest.Mock).mockResolvedValue({ success: true });
    lifecycle.handleOpenProject = jest.fn().mockResolvedValue({ success: true });
    lifecycle.handleBrowseFiles = jest.fn().mockResolvedValue({ success: true });
    lifecycle.handleLog = jest.fn().mockResolvedValue({ success: true });
    lifecycle.handleCancelProjectCreation = jest.fn().mockResolvedValue({ success: true });
    lifecycle.handleCancelMeshCreation = jest.fn().mockResolvedValue({ success: true });
    lifecycle.handleCancelAuthPolling = jest.fn().mockResolvedValue({ success: true });
    lifecycle.handleOpenAdobeConsole = jest.fn().mockResolvedValue({ success: true });

    // Prerequisite handlers
    (prerequisites.handleCheckPrerequisites as jest.Mock).mockResolvedValue({ success: true });
    (prerequisites.handleContinuePrerequisites as jest.Mock).mockResolvedValue({ success: true });
    (prerequisites.handleInstallPrerequisite as jest.Mock).mockResolvedValue({ success: true });

    // Component handlers
    components.handleUpdateComponentSelection = jest.fn().mockResolvedValue({ success: true });
    components.handleUpdateComponentsData = jest.fn().mockResolvedValue({ success: true });
    components.handleLoadComponents = jest.fn().mockResolvedValue({ success: true });
    components.handleGetComponentsData = jest.fn().mockResolvedValue({ success: true });
    components.handleCheckCompatibility = jest.fn().mockResolvedValue({ success: true });
    components.handleLoadDependencies = jest.fn().mockResolvedValue({ success: true });
    components.handleLoadPreset = jest.fn().mockResolvedValue({ success: true });
    components.handleValidateSelection = jest.fn().mockResolvedValue({ success: true });

    // Authentication handlers
    (auth.handleCheckAuth as jest.Mock).mockResolvedValue({ success: true });
    (auth.handleAuthenticate as jest.Mock).mockResolvedValue({ success: true });

    // Project handlers
    (projects.handleEnsureOrgSelected as jest.Mock).mockResolvedValue({ success: true });
    (projects.handleGetProjects as jest.Mock).mockResolvedValue({ success: true });
    (projects.handleSelectProject as jest.Mock).mockResolvedValue({ success: true });
    projects.handleCheckProjectApis = jest.fn().mockResolvedValue({ success: true });

    // Workspace handlers
    (workspaces.handleGetWorkspaces as jest.Mock).mockResolvedValue({ success: true });
    (workspaces.handleSelectWorkspace as jest.Mock).mockResolvedValue({ success: true });

    // Mesh handlers
    mesh.handleCheckApiMesh = jest.fn().mockResolvedValue({ success: true });
    mesh.handleCreateApiMesh = jest.fn().mockResolvedValue({ success: true });
    mesh.handleDeleteApiMesh = jest.fn().mockResolvedValue({ success: true });

    // Project creation handlers
    creation.handleValidate = jest.fn().mockResolvedValue({ success: true });
    creation.handleCheckProjectName = jest.fn().mockResolvedValue({ success: true });
    creation.handleCreateProject = jest.fn().mockResolvedValue({ success: true });
    creation.handleBackupProject = jest.fn().mockResolvedValue({ success: true });
    creation.handleRestoreProject = jest.fn().mockResolvedValue({ success: true });
}

/**
 * Mock all handler modules
 * Should be called at the top level of test files
 */
export function mockHandlerModules(): void {
    jest.mock('@/features/lifecycle/handlers/lifecycleHandlers');
    jest.mock('@/features/prerequisites/handlers');
    jest.mock('@/features/components/handlers/componentHandlers');
    jest.mock('@/features/authentication/handlers/authenticationHandlers');
    jest.mock('@/features/authentication/handlers/projectHandlers');
    jest.mock('@/features/authentication/handlers/workspaceHandlers');
    jest.mock('@/features/mesh/handlers');
    jest.mock('@/features/project-creation/handlers');
}
