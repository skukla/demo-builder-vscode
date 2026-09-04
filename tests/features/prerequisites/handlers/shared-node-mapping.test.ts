import {
    getNodeVersionIdMapping,
    getNodeVersionMapping,
} from '@/features/prerequisites/handlers/shared';
import { createPrereqHandlerContext, createComponentSelection } from './testHelpers';
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
const mockGetNodeVersionToComponentIdMapping = jest.fn();

jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
    ComponentRegistryManager: jest.fn().mockImplementation(() => ({
        getNodeVersionToComponentMapping: mockGetNodeVersionToComponentMapping,
        getNodeVersionToComponentIdMapping: mockGetNodeVersionToComponentIdMapping,
    })),
}));

describe('Prerequisites Handlers - getNodeVersionMapping', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return mapping from ComponentRegistryManager', async () => {
        const mockMapping = { '18': 'commerce-paas', '20': 'adobe-app-builder' };
        mockGetNodeVersionToComponentMapping.mockResolvedValue(mockMapping);

        const context = createPrereqHandlerContext({
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
            []
        );
    });

    it('should return empty object if no component selection', async () => {
        const context = createPrereqHandlerContext();

        const result = await getNodeVersionMapping(context);

        expect(result).toEqual({});
        expect(mockGetNodeVersionToComponentMapping).not.toHaveBeenCalled();
    });

    it('should handle ComponentRegistryManager failure gracefully', async () => {
        const error = new Error('Import failed');
        mockGetNodeVersionToComponentMapping.mockRejectedValue(error);

        const context = createPrereqHandlerContext({
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

        const context = createPrereqHandlerContext({
            sharedState: {
                isAuthenticating: false,
                currentComponentSelection: createComponentSelection({
                    frontend: 'react-spa',
                    backend: 'nodejs-api',
                    dependencies: ['dep1', 'dep2'],
                    integrations: ['commerce-mesh'],
                }),
            },
        });

        await getNodeVersionMapping(context);

        expect(mockGetNodeVersionToComponentMapping).toHaveBeenCalledWith(
            'react-spa',
            'nodejs-api',
            ['dep1', 'dep2'],
            ['commerce-mesh']
        );
    });

    it('uses the registry from the context rather than building its own', async () => {
        // REPLACES a test that asserted `new ComponentRegistryManager(extensionPath)`
        // was called with the right path. That pinned the construction ADR-015
        // forbids at this layer; the registry now arrives on HandlerContext,
        // built once at the composition point. Asserting the handler READS the
        // one it was handed is the contract that survived the change.
        mockGetNodeVersionToComponentMapping.mockResolvedValue({});

        const handedIn = {
            getNodeVersionToComponentMapping: jest.fn().mockResolvedValue({ '22': 'react-app' }),
        };
        const context = createPrereqHandlerContext({
            componentRegistry: handedIn as unknown as HandlerContext['componentRegistry'],
            sharedState: {
                isAuthenticating: false,
                currentComponentSelection: createComponentSelection({
                    frontend: 'react-app',
                    backend: 'nodejs',
                }),
            },
        });

        await getNodeVersionMapping(context);

        // The registry it was HANDED is the one it used — not a second one it
        // built for itself, which is what the old test allowed.
        expect(handedIn.getNodeVersionToComponentMapping).toHaveBeenCalled();
        expect(await getNodeVersionMapping(context)).toEqual({ '22': 'react-app' });
    });

    it('does not touch the registry when there is no selection', async () => {
        const context = createPrereqHandlerContext();

        await getNodeVersionMapping(context);

        expect(mockGetNodeVersionToComponentMapping).not.toHaveBeenCalled();
        expect(context.logger.warn).not.toHaveBeenCalled();
    });
});

describe('Prerequisites Handlers - getNodeVersionIdMapping', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns the id mapping the registry builds from the whole selection', async () => {
        mockGetNodeVersionToComponentIdMapping.mockResolvedValue({
            '20': 'commerce-mesh',
            '24': 'headless',
        });
        const context = createPrereqHandlerContext({
            sharedState: {
                isAuthenticating: false,
                currentComponentSelection: createComponentSelection({
                    frontend: 'headless',
                    backend: 'adobe-commerce-paas',
                    dependencies: ['commerce-mesh'],
                    integrations: ['aem-assets'],
                }),
            },
        });

        const mapping = await getNodeVersionIdMapping(context);

        expect(mapping).toEqual({ '20': 'commerce-mesh', '24': 'headless' });
        expect(mockGetNodeVersionToComponentIdMapping).toHaveBeenCalledWith(
            'headless',
            'adobe-commerce-paas',
            ['commerce-mesh'],
            ['aem-assets']
        );
    });

    it('is empty without a selection, and the registry is not asked', async () => {
        const context = createPrereqHandlerContext();

        expect(await getNodeVersionIdMapping(context)).toEqual({});
        expect(mockGetNodeVersionToComponentIdMapping).not.toHaveBeenCalled();
        // Having no selection yet is a normal state, not a degraded one: the empty
        // result must come from the early return, never from the catch. Both look
        // identical in the return value, and the warning is what separates them.
        expect(context.logger.warn).not.toHaveBeenCalled();
    });

    it('is empty when the registry fails, so the check proceeds without the association', async () => {
        mockGetNodeVersionToComponentIdMapping.mockRejectedValue(new Error('registry unavailable'));
        const context = createPrereqHandlerContext({
            sharedState: {
                isAuthenticating: false,
                currentComponentSelection: createComponentSelection({ frontend: 'headless' }),
            },
        });

        expect(await getNodeVersionIdMapping(context)).toEqual({});
        expect(context.logger.warn).toHaveBeenCalledTimes(1);
    });
});
