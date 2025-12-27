/**
 * ComponentRegistryManager - Configuration Tests
 *
 * Tests node version resolution and compatibility checking operations.
 */

// Mock ConfigurationLoader - MUST be before imports
jest.mock('@/core/config/ConfigurationLoader', () => {
    return {
        ConfigurationLoader: jest.fn().mockImplementation(() => {
            return {
                load: jest.fn(),
            };
        }),
    };
});

import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import { mockRawRegistry } from './ComponentRegistryManager.testUtils';

describe('ComponentRegistryManager - Configuration', () => {
    let manager: ComponentRegistryManager;
    let mockLoader: any;

    beforeEach(() => {
        jest.clearAllMocks();

        manager = new ComponentRegistryManager('/fake/extension/path');

        // Get the mock loader instance (must be after manager creation)
        const { ConfigurationLoader } = require('@/core/config/ConfigurationLoader');
        mockLoader = ConfigurationLoader.mock.results[0]?.value;
    });

    describe('node version resolution', () => {
        beforeEach(() => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);
        });

        it('should return empty set when frontend and backend have no Node requirements', async () => {
            // EDS and PaaS don't require Node (they're remote services)
            const versions = await manager.getRequiredNodeVersions('eds', 'adobe-commerce-paas');

            expect(versions.size).toBe(0);
        });

        it('should resolve node version from headless frontend', async () => {
            // Headless (Next.js) requires Node 24
            const versions = await manager.getRequiredNodeVersions('headless');

            expect(versions.size).toBe(1);
            expect(versions.has('24')).toBe(true);
        });

        it('should return empty for dependencies without nodeVersion', async () => {
            // demo-inspector is a browser overlay without Node requirement
            const versions = await manager.getRequiredNodeVersions('eds', 'adobe-commerce-paas', ['demo-inspector']);

            expect(versions.size).toBe(0);
        });

        it('should include app builder node versions', async () => {
            // integration-service requires Node 22
            const versions = await manager.getRequiredNodeVersions(
                'eds',
                'adobe-commerce-paas',
                undefined,
                undefined,
                ['integration-service']
            );

            expect(versions.size).toBe(1);
            expect(versions.has('22')).toBe(true);
        });

        it('should return empty set when no components specified', async () => {
            const versions = await manager.getRequiredNodeVersions();

            expect(versions.size).toBe(0);
        });
    });

    describe('compatibility checking', () => {
        beforeEach(() => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);
        });

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
