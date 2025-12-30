/**
 * Stack Helpers Tests
 *
 * Tests for deriving component selections from stacks and getting content sources.
 * Follows TDD methodology - these tests are written BEFORE implementation.
 */

import {
    deriveComponentsFromStack,
    getStackComponentIds,
    filterComponentConfigsForStackChange,
} from '@/features/project-creation/ui/helpers/stackHelpers';
import type { Stack } from '@/types/stacks';

// Test fixtures matching templates/stacks.json
const headlessStack: Stack = {
    id: 'headless',
    name: 'Headless',
    description: 'NextJS storefront with API Mesh and Commerce PaaS',
    icon: 'nextjs',
    frontend: 'headless',
    backend: 'adobe-commerce-paas',
    dependencies: ['commerce-mesh', 'demo-inspector'],
    features: ['Server-side rendering', 'API Mesh integration', 'Full customization'],
};

const edgeDeliveryStack: Stack = {
    id: 'edge-delivery',
    name: 'Edge Delivery',
    description: 'EDS storefront with Commerce Drop-ins and ACCS',
    icon: 'eds',
    frontend: 'eds-storefront',
    backend: 'adobe-commerce-accs',
    dependencies: ['demo-inspector'],
    features: ['Ultra-fast delivery', 'DA.live content', 'Commerce Drop-ins'],
    requiresGitHub: true,
    requiresDaLive: true,
};

// Note: Brand fixtures removed - brands.json replaced by demo-packages.json
// See: .rptc/plans/demo-packages-simplification/

describe('stackHelpers', () => {
    describe('deriveComponentsFromStack', () => {
        it('should derive components from headless stack', () => {
            // Given: A headless stack with frontend, backend, and dependencies
            const stack = headlessStack;

            // When: Deriving components from the stack
            const result = deriveComponentsFromStack(stack);

            // Then: Should have correct frontend
            expect(result.frontend).toBe('headless');

            // And: Should have correct backend
            expect(result.backend).toBe('adobe-commerce-paas');

            // And: Should include commerce-mesh in dependencies
            expect(result.dependencies).toContain('commerce-mesh');
            expect(result.dependencies).toContain('demo-inspector');
        });

        it('should derive components from edge-delivery stack', () => {
            // Given: An edge delivery stack with frontend, backend, and dependencies
            const stack = edgeDeliveryStack;

            // When: Deriving components from the stack
            const result = deriveComponentsFromStack(stack);

            // Then: Should have correct frontend
            expect(result.frontend).toBe('eds-storefront');

            // And: Should have correct backend
            expect(result.backend).toBe('adobe-commerce-accs');

            // And: Should NOT include commerce-mesh (EDS doesn't use it)
            expect(result.dependencies).not.toContain('commerce-mesh');

            // And: Should include demo-inspector
            expect(result.dependencies).toContain('demo-inspector');
        });

        it('should initialize empty arrays for integrations and appBuilder', () => {
            // Given: A stack
            const stack = headlessStack;

            // When: Deriving components from the stack
            const result = deriveComponentsFromStack(stack);

            // Then: Should have empty integrations array
            expect(result.integrations).toEqual([]);

            // And: Should have empty appBuilder array
            expect(result.appBuilder).toEqual([]);
        });

        it('should handle stack with empty dependencies', () => {
            // Given: A stack with no dependencies
            const stackWithNoDeps: Stack = {
                id: 'minimal',
                name: 'Minimal',
                description: 'Minimal stack',
                frontend: 'minimal-frontend',
                backend: 'minimal-backend',
                dependencies: [],
            };

            // When: Deriving components from the stack
            const result = deriveComponentsFromStack(stackWithNoDeps);

            // Then: Should have empty dependencies array
            expect(result.dependencies).toEqual([]);
        });

        it('should return a ComponentSelection structure', () => {
            // Given: Any stack
            const stack = headlessStack;

            // When: Deriving components from the stack
            const result = deriveComponentsFromStack(stack);

            // Then: Result should have all ComponentSelection properties
            expect(result).toHaveProperty('frontend');
            expect(result).toHaveProperty('backend');
            expect(result).toHaveProperty('dependencies');
            expect(result).toHaveProperty('integrations');
            expect(result).toHaveProperty('appBuilder');
        });
    });

    // Note: getContentSourceForBrand tests removed - function removed with brands.json
    // See: .rptc/plans/demo-packages-simplification/

    describe('getStackComponentIds', () => {
        // Test fixtures matching real stacks.json
        const headlessPaasStack: Stack = {
            id: 'headless-paas',
            name: 'Headless + PaaS',
            description: 'NextJS storefront with API Mesh and Commerce PaaS',
            frontend: 'headless',
            backend: 'adobe-commerce-paas',
            dependencies: ['commerce-mesh', 'demo-inspector'],
            optionalAddons: ['adobe-commerce-aco'],
        };

        const edsPaasStack: Stack = {
            id: 'eds-paas',
            name: 'Edge Delivery + PaaS',
            description: 'EDS storefront with Commerce Drop-ins and PaaS',
            frontend: 'eds',
            backend: 'adobe-commerce-paas',
            dependencies: ['commerce-mesh', 'demo-inspector'],
            optionalAddons: ['adobe-commerce-aco'],
            requiresGitHub: true,
            requiresDaLive: true,
        };

        it('should include frontend in component IDs', () => {
            const result = getStackComponentIds(headlessPaasStack);
            expect(result).toContain('headless');
        });

        it('should include backend in component IDs', () => {
            const result = getStackComponentIds(headlessPaasStack);
            expect(result).toContain('adobe-commerce-paas');
        });

        it('should include all dependencies in component IDs', () => {
            const result = getStackComponentIds(headlessPaasStack);
            expect(result).toContain('commerce-mesh');
            expect(result).toContain('demo-inspector');
        });

        it('should include optional addons in component IDs', () => {
            const result = getStackComponentIds(headlessPaasStack);
            expect(result).toContain('adobe-commerce-aco');
        });

        it('should handle stack without optional addons', () => {
            const stackNoAddons: Stack = {
                id: 'minimal',
                name: 'Minimal',
                description: 'Minimal stack',
                frontend: 'frontend-a',
                backend: 'backend-a',
                dependencies: ['dep-a'],
            };

            const result = getStackComponentIds(stackNoAddons);
            expect(result).toEqual(['frontend-a', 'backend-a', 'dep-a']);
        });

        it('should return all component types in correct order', () => {
            const result = getStackComponentIds(headlessPaasStack);
            // Order: frontend, backend, dependencies..., optionalAddons...
            expect(result).toEqual([
                'headless',
                'adobe-commerce-paas',
                'commerce-mesh',
                'demo-inspector',
                'adobe-commerce-aco',
            ]);
        });
    });

    describe('filterComponentConfigsForStackChange', () => {
        // Test fixtures matching real stacks.json
        const headlessPaasStack: Stack = {
            id: 'headless-paas',
            name: 'Headless + PaaS',
            description: 'NextJS storefront with API Mesh and Commerce PaaS',
            frontend: 'headless',
            backend: 'adobe-commerce-paas',
            dependencies: ['commerce-mesh', 'demo-inspector'],
            optionalAddons: ['adobe-commerce-aco'],
        };

        const headlessAccsStack: Stack = {
            id: 'headless-accs',
            name: 'Headless + ACCS',
            description: 'NextJS storefront with API Mesh and Commerce ACCS',
            frontend: 'headless',
            backend: 'adobe-commerce-accs',
            dependencies: ['commerce-mesh', 'demo-inspector'],
            optionalAddons: ['adobe-commerce-aco'],
        };

        const edsPaasStack: Stack = {
            id: 'eds-paas',
            name: 'Edge Delivery + PaaS',
            description: 'EDS storefront with Commerce Drop-ins and PaaS',
            frontend: 'eds',
            backend: 'adobe-commerce-paas',
            dependencies: ['commerce-mesh', 'demo-inspector'],
            optionalAddons: ['adobe-commerce-aco'],
            requiresGitHub: true,
            requiresDaLive: true,
        };

        const edsAccsStack: Stack = {
            id: 'eds-accs',
            name: 'Edge Delivery + ACCS',
            description: 'EDS storefront with Commerce Drop-ins and ACCS',
            frontend: 'eds',
            backend: 'adobe-commerce-accs',
            dependencies: ['commerce-mesh', 'demo-inspector'],
            optionalAddons: ['adobe-commerce-aco'],
            requiresGitHub: true,
            requiresDaLive: true,
        };

        describe('switching between same-frontend stacks (backend change only)', () => {
            it('should retain frontend config when switching headless-paas → headless-accs', () => {
                // Given: User has configured headless frontend
                const currentConfigs = {
                    headless: { PORT: 3000, API_KEY: 'abc123' },
                    'adobe-commerce-paas': { STORE_URL: 'https://old.store' },
                    'commerce-mesh': { MESH_ID: 'mesh-123' },
                };

                // When: Switching to headless-accs (same frontend, different backend)
                const result = filterComponentConfigsForStackChange(
                    headlessPaasStack,
                    headlessAccsStack,
                    currentConfigs,
                );

                // Then: Frontend config should be retained
                expect(result.headless).toEqual({ PORT: 3000, API_KEY: 'abc123' });
            });

            it('should clear backend config when backend changes', () => {
                const currentConfigs = {
                    headless: { PORT: 3000 },
                    'adobe-commerce-paas': { STORE_URL: 'https://old.store' },
                };

                const result = filterComponentConfigsForStackChange(
                    headlessPaasStack,
                    headlessAccsStack,
                    currentConfigs,
                );

                // Backend config should be cleared (adobe-commerce-paas → adobe-commerce-accs)
                expect(result['adobe-commerce-paas']).toBeUndefined();
                expect(result['adobe-commerce-accs']).toBeUndefined();
            });

            it('should retain shared dependency configs', () => {
                const currentConfigs = {
                    'commerce-mesh': { MESH_ID: 'mesh-123', MESH_API_KEY: 'key-xyz' },
                    'demo-inspector': { ENABLED: true },
                };

                const result = filterComponentConfigsForStackChange(
                    headlessPaasStack,
                    headlessAccsStack,
                    currentConfigs,
                );

                // Dependencies are the same between stacks
                expect(result['commerce-mesh']).toEqual({ MESH_ID: 'mesh-123', MESH_API_KEY: 'key-xyz' });
                expect(result['demo-inspector']).toEqual({ ENABLED: true });
            });
        });

        describe('switching between different-frontend stacks', () => {
            it('should clear frontend config when frontend changes', () => {
                const currentConfigs = {
                    headless: { PORT: 3000, CUSTOM_SETTING: 'value' },
                    'adobe-commerce-paas': { STORE_URL: 'https://store.com' },
                };

                // Switching from headless-paas to eds-paas
                const result = filterComponentConfigsForStackChange(
                    headlessPaasStack,
                    edsPaasStack,
                    currentConfigs,
                );

                // Headless config should be cleared
                expect(result.headless).toBeUndefined();
            });

            it('should retain backend config when backend stays same', () => {
                const currentConfigs = {
                    headless: { PORT: 3000 },
                    'adobe-commerce-paas': { STORE_URL: 'https://store.com', API_KEY: 'secret' },
                };

                // Switching from headless-paas to eds-paas (same backend)
                const result = filterComponentConfigsForStackChange(
                    headlessPaasStack,
                    edsPaasStack,
                    currentConfigs,
                );

                // Backend config should be retained
                expect(result['adobe-commerce-paas']).toEqual({ STORE_URL: 'https://store.com', API_KEY: 'secret' });
            });

            it('should retain shared dependency configs when switching frontend', () => {
                const currentConfigs = {
                    headless: { PORT: 3000 },
                    'commerce-mesh': { MESH_ID: 'mesh-456' },
                    'demo-inspector': { ENABLED: false },
                };

                // Both headless-paas and eds-paas have commerce-mesh and demo-inspector
                const result = filterComponentConfigsForStackChange(
                    headlessPaasStack,
                    edsPaasStack,
                    currentConfigs,
                );

                expect(result['commerce-mesh']).toEqual({ MESH_ID: 'mesh-456' });
                expect(result['demo-inspector']).toEqual({ ENABLED: false });
            });
        });

        describe('switching to completely different stack', () => {
            it('should clear both frontend and backend when both change', () => {
                const currentConfigs = {
                    headless: { PORT: 3000 },
                    'adobe-commerce-paas': { STORE_URL: 'https://store.com' },
                };

                // Switching from headless-paas to eds-accs (different frontend AND backend)
                const result = filterComponentConfigsForStackChange(
                    headlessPaasStack,
                    edsAccsStack,
                    currentConfigs,
                );

                expect(result.headless).toBeUndefined();
                expect(result['adobe-commerce-paas']).toBeUndefined();
            });

            it('should still retain shared dependencies', () => {
                const currentConfigs = {
                    headless: { PORT: 3000 },
                    'adobe-commerce-paas': { STORE_URL: 'https://store.com' },
                    'commerce-mesh': { MESH_ID: 'mesh-789' },
                    'demo-inspector': { DEBUG: true },
                };

                const result = filterComponentConfigsForStackChange(
                    headlessPaasStack,
                    edsAccsStack,
                    currentConfigs,
                );

                // Shared dependencies are retained
                expect(result['commerce-mesh']).toEqual({ MESH_ID: 'mesh-789' });
                expect(result['demo-inspector']).toEqual({ DEBUG: true });
            });
        });

        describe('edge cases', () => {
            it('should return empty object when oldStack is undefined (first selection)', () => {
                const currentConfigs = {
                    headless: { PORT: 3000 },
                };

                const result = filterComponentConfigsForStackChange(
                    undefined,
                    headlessPaasStack,
                    currentConfigs,
                );

                expect(result).toEqual({});
            });

            it('should return empty object when currentConfigs is empty', () => {
                const result = filterComponentConfigsForStackChange(
                    headlessPaasStack,
                    headlessAccsStack,
                    {},
                );

                expect(result).toEqual({});
            });

            it('should return empty object when currentConfigs has no matching components', () => {
                const currentConfigs = {
                    'unknown-component': { SETTING: 'value' },
                    'another-unknown': { VALUE: 123 },
                };

                const result = filterComponentConfigsForStackChange(
                    headlessPaasStack,
                    headlessAccsStack,
                    currentConfigs,
                );

                expect(result).toEqual({});
            });

            it('should handle configs with complex nested values', () => {
                const currentConfigs = {
                    headless: {
                        PORT: 3000,
                        nested: { deep: { value: 'preserved' } },
                        array: [1, 2, 3],
                    },
                };

                const result = filterComponentConfigsForStackChange(
                    headlessPaasStack,
                    headlessAccsStack,
                    currentConfigs,
                );

                expect(result.headless).toEqual({
                    PORT: 3000,
                    nested: { deep: { value: 'preserved' } },
                    array: [1, 2, 3],
                });
            });

            it('should handle optional addons in old stack', () => {
                const currentConfigs = {
                    'adobe-commerce-aco': { ACO_SETTING: 'enabled' },
                    'commerce-mesh': { MESH_ID: 'mesh' },
                };

                // Both stacks have adobe-commerce-aco as optional addon
                const result = filterComponentConfigsForStackChange(
                    headlessPaasStack,
                    headlessAccsStack,
                    currentConfigs,
                );

                expect(result['adobe-commerce-aco']).toEqual({ ACO_SETTING: 'enabled' });
            });
        });

        describe('real-world scenarios', () => {
            it('should preserve user work when switching from PaaS to ACCS (same frontend)', () => {
                // User has spent time configuring their headless storefront
                const userConfigs = {
                    headless: {
                        PORT: 8080,
                        NEXT_PUBLIC_API_URL: 'https://custom.api',
                        CUSTOM_THEME: 'dark',
                    },
                    'adobe-commerce-paas': {
                        MAGENTO_URL: 'https://paas.commerce.com',
                        STORE_CODE: 'default',
                    },
                    'commerce-mesh': {
                        MESH_ID: 'user-mesh-id',
                        MESH_API_KEY: 'user-mesh-key',
                    },
                    'demo-inspector': {
                        ENABLED: true,
                        LOG_LEVEL: 'debug',
                    },
                };

                // User switches to ACCS backend (common scenario: trying managed backend)
                const result = filterComponentConfigsForStackChange(
                    headlessPaasStack,
                    headlessAccsStack,
                    userConfigs,
                );

                // Frontend work is preserved (user's customizations)
                expect(result.headless).toEqual({
                    PORT: 8080,
                    NEXT_PUBLIC_API_URL: 'https://custom.api',
                    CUSTOM_THEME: 'dark',
                });

                // Backend is cleared (different service)
                expect(result['adobe-commerce-paas']).toBeUndefined();

                // Shared dependencies are preserved
                expect(result['commerce-mesh']).toEqual({
                    MESH_ID: 'user-mesh-id',
                    MESH_API_KEY: 'user-mesh-key',
                });
                expect(result['demo-inspector']).toEqual({
                    ENABLED: true,
                    LOG_LEVEL: 'debug',
                });
            });
        });
    });
});
