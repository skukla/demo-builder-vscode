/**
 * ComponentRegistryManager - frontend/backend compatibility.
 *
 * The node-version mapping tests that once shared this file went with
 * `getNodeVersionToComponentMapping` (PR-1a): the catalog no longer carries a Node.
 */

import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import { mockRawRegistry, getMockLoader } from './ComponentRegistryManager.testUtils';

// Mock ConfigurationLoader (Jest hoisting requirement)
jest.mock('@/core/config/ConfigurationLoader', () => {
    return {
        ConfigurationLoader: jest.fn().mockImplementation(() => {
            return {
                load: jest.fn(),
            };
        }),
    };
});

describe('Component Registry Manager - Compatibility', () => {
    let manager: ComponentRegistryManager;
    let mockLoader: any;

    beforeEach(() => {
        jest.clearAllMocks();
        manager = new ComponentRegistryManager('/fake/extension/path');
        mockLoader = getMockLoader();
        mockLoader.load.mockResolvedValue(mockRawRegistry);
    });

    describe('compatibility checking', () => {
        it('should return true for compatible frontend and backend', async () => {
            const isCompatible = await manager.checkCompatibility('eds', 'adobe-commerce-paas');

            expect(isCompatible).toBe(true);
        });

        it('should return false for incompatible frontend and backend', async () => {
            const isCompatible = await manager.checkCompatibility('eds', 'nonexistent');

            expect(isCompatible).toBe(false);
        });

        it('should return false when frontend not found', async () => {
            const isCompatible = await manager.checkCompatibility('nonexistent', 'adobe-commerce-paas');

            expect(isCompatible).toBe(false);
        });

        it('should return false when frontend has no compatibleBackends', async () => {
            const isCompatible = await manager.checkCompatibility('headless', 'adobe-commerce-paas');

            expect(isCompatible).toBe(false);
        });
    });
});
