/**
 * Unit tests for envFileGenerator - Value resolution
 * Tests runtime config, user-provided values, defaults, and fallback logic
 */

import { promises as fsPromises } from 'fs';
import { generateComponentEnvFile } from '@/features/project-creation/helpers/envFileGenerator';
import { TransformedComponentDefinition } from '@/types/components';
import type { Logger } from '@/types/logger';
import {
    createMockLogger,
    sharedEnvVars,
    TEST_COMPONENT_PATH,
} from './envFileGenerator.testUtils';

// Mock fs promises
jest.mock('fs', () => ({
    promises: {
        writeFile: jest.fn(),
    },
}));

// Mock formatters
jest.mock('@/features/project-creation/helpers/formatters', () => ({
    formatGroupName: (group: string) => group.split('-').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' '),
}));

describe('envFileGenerator - Value Resolution', () => {
    let mockLogger: Logger;

    beforeEach(() => {
        jest.clearAllMocks();
        mockLogger = createMockLogger();
    });

    describe('runtime config values', () => {
        it('should prioritize MESH_ENDPOINT from runtime config', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                configuration: {
                    requiredEnvVars: ['MESH_ENDPOINT'],
                    optionalEnvVars: [],
                },
            } as TransformedComponentDefinition;

            const config = {
                apiMesh: {
                    endpoint: 'https://runtime-endpoint.adobe.io/graphql',
                },
            };

            await generateComponentEnvFile(
                TEST_COMPONENT_PATH,
                'test-component',
                componentDef,
                sharedEnvVars,
                config,
                mockLogger,
            );

            const [[, content]] = (fsPromises.writeFile as jest.Mock).mock.calls;
            expect(content).toContain('MESH_ENDPOINT=https://runtime-endpoint.adobe.io/graphql');
        });
    });

    describe('user-provided values', () => {
        it('should use user-provided values from componentConfigs', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                configuration: {
                    requiredEnvVars: ['API_KEY'],
                    optionalEnvVars: [],
                },
            } as TransformedComponentDefinition;

            const config = {
                componentConfigs: {
                    'test-component': {
                        API_KEY: 'user-provided-key',
                    },
                },
            };

            await generateComponentEnvFile(
                TEST_COMPONENT_PATH,
                'test-component',
                componentDef,
                sharedEnvVars,
                config,
                mockLogger,
            );

            const [[, content]] = (fsPromises.writeFile as jest.Mock).mock.calls;
            expect(content).toContain('API_KEY=user-provided-key');
        });

        it('should search all components for user-provided values', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                configuration: {
                    requiredEnvVars: ['SHARED_VAR'],
                    optionalEnvVars: [],
                },
            } as TransformedComponentDefinition;

            const config = {
                componentConfigs: {
                    'other-component': {
                        SHARED_VAR: 'value-from-other-component',
                    },
                },
            };

            await generateComponentEnvFile(
                TEST_COMPONENT_PATH,
                'test-component',
                componentDef,
                sharedEnvVars,
                config,
                mockLogger,
            );

            const [[, content]] = (fsPromises.writeFile as jest.Mock).mock.calls;
            expect(content).toContain('SHARED_VAR=value-from-other-component');
        });
    });

    describe('default values and fallbacks', () => {
        it('should fall back to default value if no user value', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                configuration: {
                    requiredEnvVars: ['DEFAULT_VAR'],
                    optionalEnvVars: [],
                },
            } as TransformedComponentDefinition;

            await generateComponentEnvFile(
                TEST_COMPONENT_PATH,
                'test-component',
                componentDef,
                sharedEnvVars,
                {},
                mockLogger,
            );

            const [[, content]] = (fsPromises.writeFile as jest.Mock).mock.calls;
            expect(content).toContain('DEFAULT_VAR=default-value');
        });

        it('should use empty string if no default or user value', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                configuration: {
                    requiredEnvVars: ['EMPTY_VAR'],
                    optionalEnvVars: [],
                },
            } as TransformedComponentDefinition;

            await generateComponentEnvFile(
                TEST_COMPONENT_PATH,
                'test-component',
                componentDef,
                sharedEnvVars,
                {},
                mockLogger,
            );

            const [[, content]] = (fsPromises.writeFile as jest.Mock).mock.calls;
            expect(content).toContain('EMPTY_VAR=');
        });
    });
});
