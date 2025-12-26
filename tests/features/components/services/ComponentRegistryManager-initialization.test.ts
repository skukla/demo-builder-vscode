/**
 * ComponentRegistryManager - Initialization Tests
 *
 * Tests registry loading, caching, and transformation operations.
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

// Mock vscode
jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: jest.fn(() => ({
            get: jest.fn((key: string, defaultValue: number) => defaultValue),
        })),
    },
}), { virtual: true });

import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import { mockRawRegistry } from './ComponentRegistryManager.testUtils';

describe('ComponentRegistryManager - Initialization', () => {
    let manager: ComponentRegistryManager;
    let mockLoader: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create manager instance (triggers constructor)
        manager = new ComponentRegistryManager('/fake/extension/path');

        // Get the mock loader instance (must be after manager creation)
        const { ConfigurationLoader } = require('@/core/config/ConfigurationLoader');
        mockLoader = ConfigurationLoader.mock.results[0]?.value;
    });

    describe('registry loading', () => {
        it('should load and cache registry on first call', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const registry = await manager.loadRegistry();

            expect(mockLoader.load).toHaveBeenCalledTimes(1);
            expect(registry).toBeDefined();
            expect(registry.version).toBe('3.0.0');
        });

        it('should return cached registry on subsequent calls', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            await manager.loadRegistry();
            await manager.loadRegistry();
            await manager.loadRegistry();

            expect(mockLoader.load).toHaveBeenCalledTimes(1);
        });

        it('should transform raw registry to grouped structure', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const registry = await manager.loadRegistry();

            expect(registry.components).toBeDefined();
            expect(registry.components.frontends).toHaveLength(2);
            expect(registry.components.backends).toHaveLength(1);
            expect(registry.components.dependencies).toHaveLength(1);
            expect(registry.components.integrations).toHaveLength(1);
            expect(registry.components.appBuilder).toHaveLength(1);
        });

        it('should include infrastructure components', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const registry = await manager.loadRegistry();

            expect(registry.infrastructure).toHaveLength(1);
            expect(registry.infrastructure![0].id).toBe('adobe-cli');
            expect(registry.infrastructure![0].name).toBe('Adobe I/O CLI & SDK');
        });

        it('should preserve requiredEnvVars and optionalEnvVars in configuration', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const registry = await manager.loadRegistry();
            const frontend = registry.components.frontends[0];

            // Check flat structure (NOT nested in envVars)
            expect(frontend.configuration?.requiredEnvVars).toBeDefined();
            expect(frontend.configuration?.requiredEnvVars).toHaveLength(2);
            expect(frontend.configuration?.requiredEnvVars).toContain('VAR1');
            expect(frontend.configuration?.requiredEnvVars).toContain('VAR2');
        });
    });
});
