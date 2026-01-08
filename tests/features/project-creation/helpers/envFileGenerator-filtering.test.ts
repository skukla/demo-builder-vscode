/**
 * Unit tests for envFileGenerator - Variable filtering and grouping
 * Tests component-specific filtering, group organization, and default grouping
 */

import { promises as fsPromises } from 'fs';
import { generateComponentEnvFile } from '@/features/project-creation/helpers/envFileGenerator';
import { TransformedComponentDefinition } from '@/types/components';
import {
    createMockSetupContext,
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

describe('envFileGenerator - Filtering and Grouping', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('variable filtering', () => {
        it('should filter environment variables by component', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                configuration: {
                    requiredEnvVars: ['USED_VAR'],
                    optionalEnvVars: [],
                },
            } as TransformedComponentDefinition;

            const setupContext = createMockSetupContext({
                registry: { envVars: sharedEnvVars } as any,
                config: {},
            });

            await generateComponentEnvFile(
                TEST_COMPONENT_PATH,
                'test-component',
                componentDef,
                setupContext,
            );

            const [[, content]] = (fsPromises.writeFile as jest.Mock).mock.calls;
            expect(content).toContain('USED_VAR=value1');
            expect(content).not.toContain('UNUSED_VAR');
        });
    });

    describe('variable grouping', () => {
        it('should group variables by group name', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                configuration: {
                    requiredEnvVars: ['API_KEY', 'DB_HOST', 'API_URL'],
                    optionalEnvVars: [],
                },
            } as TransformedComponentDefinition;

            const setupContext = createMockSetupContext({
                registry: { envVars: sharedEnvVars } as any,
                config: {},
            });

            await generateComponentEnvFile(
                TEST_COMPONENT_PATH,
                'test-component',
                componentDef,
                setupContext,
            );

            const [[, content]] = (fsPromises.writeFile as jest.Mock).mock.calls;
            expect(content).toContain('# Api Config');
            expect(content).toContain('# Database');
        });

        it('should use "general" as default group', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                configuration: {
                    requiredEnvVars: ['VAR_WITHOUT_GROUP'],
                    optionalEnvVars: [],
                },
            } as TransformedComponentDefinition;

            const setupContext = createMockSetupContext({
                registry: { envVars: sharedEnvVars } as any,
                config: {},
            });

            await generateComponentEnvFile(
                TEST_COMPONENT_PATH,
                'test-component',
                componentDef,
                setupContext,
            );

            const [[, content]] = (fsPromises.writeFile as jest.Mock).mock.calls;
            expect(content).toContain('# General');
        });
    });
});
