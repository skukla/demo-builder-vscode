/**
 * Tests for PrerequisitesManager - Progress Tracking
 * Tests prerequisite resolution and dependency ordering
 */

// Mock debugLogger FIRST to prevent "Logger not initialized" errors
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

jest.mock('@/core/config/ConfigurationLoader');
jest.mock('@/core/di');

import { PrerequisitesManager } from '@/features/prerequisites/services/PrerequisitesManager';
import {
    setupMocks,
    setupConfigLoader,
    mockConfig,
    type TestMocks,
} from './PrerequisitesManager.testUtils';

describe('PrerequisitesManager - Progress Tracking', () => {
    let manager: PrerequisitesManager;
    let mocks: TestMocks;

    beforeEach(() => {
        mocks = setupMocks();
        setupConfigLoader();
        manager = new PrerequisitesManager('/mock/extension/path', mocks.logger);
    });

    describe('getRequiredPrerequisites', () => {
        it('should return all prerequisites when no components selected', async () => {
            const required = await manager.getRequiredPrerequisites();

            // Only returns non-optional prerequisites (node, npm) - git is optional
            expect(required).toHaveLength(2);
            expect(required.some(p => p.id === 'node')).toBe(true);
            expect(required.some(p => p.id === 'npm')).toBe(true);
        });

        it('should return component-specific prerequisites for frontend', async () => {
            const required = await manager.getRequiredPrerequisites({
                frontend: 'react-app',
            });

            const ids = required.map(p => p.id);
            expect(ids).toContain('node');
            expect(ids).toContain('npm');
        });

        it('should return combined prerequisites for multiple components', async () => {
            const required = await manager.getRequiredPrerequisites({
                frontend: 'react-app',
                backend: 'commerce-paas',
            });

            const ids = required.map(p => p.id);
            expect(ids).toContain('node');
            expect(ids).toContain('npm');
            expect(ids).toContain('git');
        });

        it('should handle dependencies array', async () => {
            const required = await manager.getRequiredPrerequisites({
                dependencies: ['commerce-paas'],
            });

            const ids = required.map(p => p.id);
            expect(ids).toContain('node');
            expect(ids).toContain('npm');
            expect(ids).toContain('git');
        });

        it('should handle appBuilder array', async () => {
            const required = await manager.getRequiredPrerequisites({
                appBuilder: ['react-app'],
            });

            const ids = required.map(p => p.id);
            expect(ids).toContain('node');
            expect(ids).toContain('npm');
        });
    });

    describe('resolveDependencies', () => {
        it('should return prerequisites in dependency order', () => {
            const result = manager.resolveDependencies(mockConfig.prerequisites);

            // node should come before npm (npm depends on node)
            const nodeIndex = result.findIndex(p => p.id === 'node');
            const npmIndex = result.findIndex(p => p.id === 'npm');

            expect(nodeIndex).toBeLessThan(npmIndex);
        });

        it('should handle empty array', () => {
            const result = manager.resolveDependencies([]);

            expect(result).toEqual([]);
        });

        it('should handle prerequisites without dependencies', () => {
            const prereqs = [
                {
                    id: 'tool1',
                    name: 'Tool 1',
                    description: 'First tool',
                    check: { command: 'tool1', args: [] },
                },
                {
                    id: 'tool2',
                    name: 'Tool 2',
                    description: 'Second tool',
                    check: { command: 'tool2', args: [] },
                },
            ];

            const result = manager.resolveDependencies(prereqs);

            expect(result).toHaveLength(2);
        });
    });
});
