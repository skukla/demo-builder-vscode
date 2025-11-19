/**
 * Unit tests for envFileGenerator - Formatting and output
 * Tests descriptions, data type handling, and output formatting
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

describe('envFileGenerator - Formatting', () => {
    let mockLogger: Logger;

    beforeEach(() => {
        jest.clearAllMocks();
        mockLogger = createMockLogger();
    });

    describe('comment formatting', () => {
        it('should include descriptions as comments', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                configuration: {
                    requiredEnvVars: ['DOCUMENTED_VAR'],
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
            expect(content).toContain('# This is a documented variable');
            expect(content).toContain('DOCUMENTED_VAR=value');
        });
    });

    describe('data type handling', () => {
        it('should handle numeric and boolean values', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                configuration: {
                    requiredEnvVars: ['PORT', 'ENABLED'],
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
            expect(content).toContain('PORT=3000');
            expect(content).toContain('ENABLED=true');
        });
    });
});
