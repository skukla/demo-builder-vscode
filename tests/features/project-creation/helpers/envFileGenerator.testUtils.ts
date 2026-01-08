/**
 * Shared test utilities for envFileGenerator tests
 */

import { EnvVarDefinition, ComponentRegistry } from '@/types/components';
import type { Logger } from '@/types/logger';
import type { HandlerContext } from '@/types/handlers';
import type { Project } from '@/types';
import { ProjectSetupContext } from '@/features/project-creation/services/ProjectSetupContext';

/**
 * Creates a mock logger for testing
 */
export function createMockLogger(): Logger {
    return {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
    };
}

/**
 * Creates a mock HandlerContext for testing
 * 
 * Provides all essential HandlerContext properties with sensible defaults.
 * Can be overridden via the overrides parameter for specific test needs.
 */
export function createMockHandlerContext(overrides?: Partial<HandlerContext>): jest.Mocked<HandlerContext> {
    return {
        logger: createMockLogger() as any,
        debugLogger: createMockLogger() as any,
        context: {
            extensionPath: '/test/extension/path',
            secrets: {} as any,
            globalState: {
                get: jest.fn(),
                update: jest.fn().mockResolvedValue(undefined),
            },
        } as any,
        panel: undefined,
        stateManager: {} as any,
        communicationManager: undefined,
        sendMessage: jest.fn().mockResolvedValue(undefined),
        sharedState: {
            isAuthenticating: false,
        },
        authManager: {} as any,
        ...overrides,
    } as jest.Mocked<HandlerContext>;
}

/**
 * Creates a mock ProjectSetupContext for testing
 * 
 * Provides a fully initialized ProjectSetupContext with mock dependencies.
 * All parameters can be customized via the overrides object.
 */
export function createMockSetupContext(
    overrides?: Partial<{
        handlerContext: HandlerContext;
        registry: ComponentRegistry;
        project: Project;
        config: Record<string, unknown>;
    }>
): ProjectSetupContext {
    const mockHandlerContext = overrides?.handlerContext || createMockHandlerContext();
    const mockRegistry: ComponentRegistry = overrides?.registry || {
        envVars: sharedEnvVars,
        components: {
            frontends: [],
            backends: [],
            dependencies: [],
            mesh: [],
            integrations: [],
            appBuilder: [],
        },
        services: {},
    };
    const mockProject: Project = overrides?.project || {
        name: 'test-project',
        path: '/test/path',
        status: 'ready',
        created: new Date().toISOString(),
    } as Project;
    const mockConfig = overrides?.config || {};
    
    return new ProjectSetupContext(
        mockHandlerContext,
        mockRegistry,
        mockProject,
        mockConfig,
    );
}

/**
 * Shared environment variables dictionary used across tests
 * Simulates registry.envVars with various test scenarios
 */
export const sharedEnvVars: Record<string, Omit<EnvVarDefinition, 'key'>> = {
    USED_VAR: {
        label: 'Used Var',
        type: 'text',
        description: 'Used by this component',
        default: 'value1',
    },
    UNUSED_VAR: {
        label: 'Unused Var',
        type: 'text',
        description: 'Used by different component',
        default: 'value2',
    },
    API_KEY: {
        label: 'API Key',
        type: 'password',
        description: 'API key',
        group: 'api-config',
    },
    DB_HOST: {
        label: 'DB Host',
        type: 'text',
        description: 'Database host',
        group: 'database',
    },
    API_URL: {
        label: 'API URL',
        type: 'url',
        description: 'API URL',
        group: 'api-config',
    },
    VAR_WITHOUT_GROUP: {
        label: 'Var Without Group',
        type: 'text',
        description: 'Variable without group',
    },
    MESH_ENDPOINT: {
        label: 'Mesh Endpoint',
        type: 'url',
        description: 'Mesh endpoint',
        default: 'default-endpoint',
    },
    SHARED_VAR: {
        label: 'Shared Var',
        type: 'text',
        description: 'Shared variable',
        default: 'default-value',
    },
    DEFAULT_VAR: {
        label: 'Default Var',
        type: 'text',
        description: 'Variable with default',
        default: 'default-value',
    },
    EMPTY_VAR: {
        label: 'Empty Var',
        type: 'text',
        description: 'Variable without default',
    },
    DOCUMENTED_VAR: {
        label: 'Documented Var',
        type: 'text',
        description: 'This is a documented variable',
        default: 'value',
    },
    PORT: {
        label: 'Port',
        type: 'number',
        description: 'Port number',
        default: 3000,
    },
    ENABLED: {
        label: 'Enabled',
        type: 'boolean',
        description: 'Feature enabled',
        default: true,
    },
};

/**
 * Constants used across tests
 */
export const TEST_COMPONENT_PATH = '/test/path/component';
