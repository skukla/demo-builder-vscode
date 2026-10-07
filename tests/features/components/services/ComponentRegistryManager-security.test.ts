/**
 * ComponentRegistryManager - Version Validation and Injection Tests
 *
 * These tests once also existed in `ComponentRegistryManager-validation.test.ts`,
 * deleted on 2026-08-31 as a byte-for-byte twin. They targeted
 * `getRequiredNodeVersions` too until that was removed (PR-1a); the format checks
 * it carried now run against `getNodeVersionToComponentMapping`, which validates
 * through the same `validateAndMapNodeVersion`.
 */

import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import {
    mockRawRegistry,
    getMockLoader,
    injectionPayloads,
    createMaliciousRegistry
} from './ComponentRegistryManager.testUtils';

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

describe('Component Registry Manager - Security Validation', () => {
    let manager: ComponentRegistryManager;
    let mockLoader: any;

    beforeEach(() => {
        jest.clearAllMocks();
        manager = new ComponentRegistryManager('/fake/extension/path');
        mockLoader = getMockLoader();
    });

    describe('getNodeVersionToComponentMapping - security validation', () => {
        it('should validate versions in infrastructure components', async () => {
            // Given: Infrastructure with malicious version
            const maliciousRegistry = createMaliciousRegistry('infrastructure.adobe-cli', '20; rm -rf /');
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getNodeVersionToComponentMapping()
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should validate versions in frontend mapping', async () => {
            // Given: Frontend with malicious version
            const maliciousRegistry = createMaliciousRegistry('frontends.eds', '20; rm -rf /');
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getNodeVersionToComponentMapping('eds')
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should validate versions in backend mapping', async () => {
            // Given: Backend with malicious version
            const maliciousRegistry = createMaliciousRegistry('backends.adobe-commerce-paas', '20; rm -rf /');
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getNodeVersionToComponentMapping(undefined, 'adobe-commerce-paas')
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should validate versions in dependencies mapping', async () => {
            // Given: Dependency with malicious version
            const maliciousRegistry = createMaliciousRegistry('dependencies.test-tool', '20; rm -rf /');
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getNodeVersionToComponentMapping(undefined, undefined, ['test-tool'])
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should accept valid versions in mapping', async () => {
            // Given: Registry with valid versions
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            // When: getNodeVersionToComponentMapping() is called
            const mapping = await manager.getNodeVersionToComponentMapping(
                'headless'                // Node 24
            );

            // Then: Mapping returned without errors
            expect(Object.keys(mapping)).toHaveLength(1);
            expect(mapping['24']).toBeDefined();  // headless
        });

        it('should accept valid semantic versions', async () => {
            // Given: Component with semantic version
            const registryWithSemver = {
                ...mockRawRegistry,
                frontends: {
                    ...mockRawRegistry.frontends,
                    eds: {
                        ...mockRawRegistry.frontends!.eds,
                        configuration: {
                            ...mockRawRegistry.frontends!.eds.configuration,
                            nodeVersion: '20.11.0'
                        }
                    }
                }
            };
            mockLoader.load.mockResolvedValue(registryWithSemver);

            const mapping = await manager.getNodeVersionToComponentMapping('eds');

            // Then: Semantic version accepted
            expect(mapping['20.11.0']).toBeDefined();
        });

        it('should throw error for invalid version format with v prefix', async () => {
            const invalidRegistry = createMaliciousRegistry('frontends.eds', 'v20');
            mockLoader.load.mockResolvedValue(invalidRegistry);

            await expect(
                manager.getNodeVersionToComponentMapping('eds')
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should throw error for invalid version format "latest"', async () => {
            // "latest" is a keyword, not in the allowlist
            const invalidRegistry = createMaliciousRegistry('frontends.eds', 'latest');
            mockLoader.load.mockResolvedValue(invalidRegistry);

            await expect(
                manager.getNodeVersionToComponentMapping('eds')
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should validate all injection payloads', async () => {
            for (const payload of injectionPayloads) {
                const maliciousRegistry = createMaliciousRegistry('frontends.eds', payload);
                mockLoader.load.mockResolvedValue(maliciousRegistry);

                await expect(
                    manager.getNodeVersionToComponentMapping('eds')
                ).rejects.toThrow(/Invalid Node/);
            }
        });
    });
});
