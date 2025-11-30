import { getRequiredNodeVersions } from '@/features/prerequisites/handlers/shared';
import { createMockContext, createComponentSelection } from './testHelpers';

/**
 * Prerequisites Handlers - Required Node Versions Test Suite
 *
 * Tests the getRequiredNodeVersions utility function.
 * This function retrieves and sorts the required Node versions for selected components.
 *
 * Total tests: 5
 */

// Mock ComponentRegistryManager module
const mockGetRequiredNodeVersions = jest.fn();

jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
    ComponentRegistryManager: jest.fn().mockImplementation(() => ({
        getRequiredNodeVersions: mockGetRequiredNodeVersions,
    })),
}));

describe('Prerequisites Handlers - getRequiredNodeVersions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return sorted array of Node versions', async () => {
        const mockVersions = new Set(['20', '18', '24']);
        mockGetRequiredNodeVersions.mockResolvedValue(mockVersions);

        const context = createMockContext({
            sharedState: {
                isAuthenticating: false,
                currentComponentSelection: createComponentSelection({
                    frontend: 'react-app',
                    backend: 'commerce-paas',
                }),
            },
        });

        const result = await getRequiredNodeVersions(context);

        expect(result).toEqual(['18', '20', '24']);
    });

    it('should return empty array if no component selection', async () => {
        const context = createMockContext();

        const result = await getRequiredNodeVersions(context);

        expect(result).toEqual([]);
        expect(mockGetRequiredNodeVersions).not.toHaveBeenCalled();
    });

    it('should sort versions in ascending order', async () => {
        const mockVersions = new Set(['24', '18', '20']);
        mockGetRequiredNodeVersions.mockResolvedValue(mockVersions);

        const context = createMockContext({
            sharedState: {
                isAuthenticating: false,
                currentComponentSelection: createComponentSelection({
                    frontend: 'react-app',
                    backend: 'nodejs',
                }),
            },
        });

        const result = await getRequiredNodeVersions(context);

        expect(result).toEqual(['18', '20', '24']);
    });

    it('should handle ComponentRegistryManager failure', async () => {
        mockGetRequiredNodeVersions.mockRejectedValue(new Error('Failed'));

        const context = createMockContext({
            sharedState: {
                isAuthenticating: false,
                currentComponentSelection: createComponentSelection(),
            },
        });

        const result = await getRequiredNodeVersions(context);

        expect(result).toEqual([]);
    });

    it('should pass all component selection parameters', async () => {
        mockGetRequiredNodeVersions.mockResolvedValue(new Set());

        const context = createMockContext({
            sharedState: {
                isAuthenticating: false,
                currentComponentSelection: createComponentSelection({
                    frontend: 'react-spa',
                    backend: 'nodejs-api',
                    dependencies: ['dep1'],
                    integrations: ['mesh'],
                    appBuilder: ['action'],
                }),
            },
        });

        await getRequiredNodeVersions(context);

        expect(mockGetRequiredNodeVersions).toHaveBeenCalledWith(
            'react-spa',
            'nodejs-api',
            ['dep1'],
            ['mesh'],
            ['action']
        );
    });
});
