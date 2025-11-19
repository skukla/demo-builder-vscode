/**
 * Shared test utilities for envFileGenerator tests
 */

import { EnvVarDefinition } from '@/types/components';
import type { Logger } from '@/types/logger';

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
