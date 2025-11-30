import { getNodeVersionMapping } from '@/features/prerequisites/handlers/shared';
import { createMockContext, createComponentSelection } from './testHelpers';
import type { HandlerContext } from '@/types/handlers';

/**
 * Prerequisites Handlers - Node Version Mapping Test Suite
 *
 * Tests the getNodeVersionMapping utility function.
 * This function maps Node versions to their corresponding components.
 *
 * Total tests: 5
 */

// Mock ComponentRegistryManager module
const mockGetNodeVersionToComponentMapping = jest.fn();

jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
    ComponentRegistryManager: jest.fn().mockImplementation(() => ({
        getNodeVersionToComponentMapping: mockGetNodeVersionToComponentMapping,
    })),
}));

describe('Prerequisites Handlers - getNodeVersionMapping', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return mapping from ComponentRegistryManager', async () => {
        const mockMapping = { '18': 'commerce-paas', '20': 'adobe-app-builder' };
        mockGetNodeVersionToComponentMapping.mockResolvedValue(mockMapping);

        const context = createMockContext({
            sharedState: {
                isAuthenticating: false,
                currentComponentSelection: createComponentSelection({
                    frontend: 'react-app',
                    backend: 'commerce-paas',
                }),
            },
        });

        const result = await getNodeVersionMapping(context);

        expect(result).toEqual(mockMapping);
        expect(mockGetNodeVersionToComponentMapping).toHaveBeenCalledWith(
            'react-app',
            'commerce-paas',
            [],
            [],
            []
        );
    });

    it('should return empty object if no component selection', async () => {
        const context = createMockContext();

        const result = await getNodeVersionMapping(context);

        expect(result).toEqual({});
        expect(mockGetNodeVersionToComponentMapping).not.toHaveBeenCalled();
    });

    it('should handle ComponentRegistryManager failure gracefully', async () => {
        const error = new Error('Import failed');
        mockGetNodeVersionToComponentMapping.mockRejectedValue(error);

        const context = createMockContext({
            sharedState: {
                isAuthenticating: false,
                currentComponentSelection: createComponentSelection(),
            },
        });

        const result = await getNodeVersionMapping(context);

        expect(result).toEqual({});
        expect(context.logger.warn).toHaveBeenCalledWith(
            'Failed to get Node version mapping:',
            error
        );
    });

    it('should pass all component selection parameters', async () => {
        mockGetNodeVersionToComponentMapping.mockResolvedValue({});

        const context = createMockContext({
            sharedState: {
                isAuthenticating: false,
                currentComponentSelection: createComponentSelection({
                    frontend: 'react-spa',
                    backend: 'nodejs-api',
                    dependencies: ['dep1', 'dep2'],
                    integrations: ['commerce-mesh'],
                    appBuilder: ['app-builder-action'],
                }),
            },
        });

        await getNodeVersionMapping(context);

        expect(mockGetNodeVersionToComponentMapping).toHaveBeenCalledWith(
            'react-spa',
            'nodejs-api',
            ['dep1', 'dep2'],
            ['commerce-mesh'],
            ['app-builder-action']
        );
    });

    it('should create ComponentRegistryManager with extension path', async () => {
        mockGetNodeVersionToComponentMapping.mockResolvedValue({});

        const context = createMockContext({
            context: { extensionPath: '/custom/path' } as HandlerContext['context'],
            sharedState: {
                isAuthenticating: false,
                currentComponentSelection: createComponentSelection({
                    frontend: 'react-app',
                    backend: 'nodejs',
                }),
            },
        });

        await getNodeVersionMapping(context);

        const { ComponentRegistryManager } = await import(
            '@/features/components/services/ComponentRegistryManager'
        );
        expect(ComponentRegistryManager).toHaveBeenCalledWith('/custom/path');
    });
});
