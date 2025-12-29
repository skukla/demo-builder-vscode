/**
 * ReviewStep Helper Tests
 *
 * Tests for resolveServiceNames and buildComponentInfoList helpers that extract
 * complex logic from the ReviewStep component's useMemo hooks.
 *
 * Follows TDD methodology - tests written BEFORE implementation.
 */

import {
    resolveServiceNames,
    buildComponentInfoList,
    type ComponentInfoItem,
} from '@/features/project-creation/ui/steps/reviewStepHelpers';
import type { ComponentData, ComponentsData } from '@/features/project-creation/ui/steps/ReviewStep';

describe('reviewStepHelpers', () => {
    // Test fixtures
    const mockServices: Record<string, { name: string; description?: string }> = {
        'commerce-service': { name: 'Commerce Service', description: 'Main commerce API' },
        'catalog-service': { name: 'Catalog Service', description: 'Product catalog' },
        'checkout-service': { name: 'Checkout Service', description: 'Payment processing' },
    };

    const mockBackends: ComponentData[] = [
        {
            id: 'adobe-commerce',
            name: 'Adobe Commerce',
            configuration: {
                requiredServices: ['commerce-service', 'catalog-service'],
            },
        },
        {
            id: 'mock-backend',
            name: 'Mock Backend',
            configuration: {
                requiredServices: [],
            },
        },
        {
            id: 'no-config-backend',
            name: 'No Config Backend',
        },
    ];

    describe('resolveServiceNames', () => {
        describe('happy path', () => {
            it('should resolve service IDs to names', () => {
                // Given: A backend with required services
                const backendId = 'adobe-commerce';

                // When: Resolving service names
                const result = resolveServiceNames(backendId, mockBackends, mockServices);

                // Then: Should return resolved service names
                expect(result).toEqual(['Commerce Service', 'Catalog Service']);
            });

            it('should return empty array when backend has no required services', () => {
                // Given: A backend with empty required services
                const backendId = 'mock-backend';

                // When: Resolving service names
                const result = resolveServiceNames(backendId, mockBackends, mockServices);

                // Then: Should return empty array
                expect(result).toEqual([]);
            });
        });

        describe('missing data handling', () => {
            it('should return empty array when backendId is undefined', () => {
                // Given: No backend selected
                const backendId = undefined;

                // When: Resolving service names
                const result = resolveServiceNames(backendId, mockBackends, mockServices);

                // Then: Should return empty array
                expect(result).toEqual([]);
            });

            it('should return empty array when backends array is empty', () => {
                // Given: Empty backends array
                const backendId = 'adobe-commerce';

                // When: Resolving service names
                const result = resolveServiceNames(backendId, [], mockServices);

                // Then: Should return empty array
                expect(result).toEqual([]);
            });

            it('should return empty array when backends is undefined', () => {
                // Given: Undefined backends
                const backendId = 'adobe-commerce';

                // When: Resolving service names
                const result = resolveServiceNames(backendId, undefined, mockServices);

                // Then: Should return empty array
                expect(result).toEqual([]);
            });

            it('should return empty array when services is undefined', () => {
                // Given: Undefined services
                const backendId = 'adobe-commerce';

                // When: Resolving service names
                const result = resolveServiceNames(backendId, mockBackends, undefined);

                // Then: Should return empty array
                expect(result).toEqual([]);
            });

            it('should return empty array when backend not found', () => {
                // Given: Backend ID that does not exist
                const backendId = 'nonexistent-backend';

                // When: Resolving service names
                const result = resolveServiceNames(backendId, mockBackends, mockServices);

                // Then: Should return empty array
                expect(result).toEqual([]);
            });

            it('should return empty array when backend has no configuration', () => {
                // Given: Backend without configuration
                const backendId = 'no-config-backend';

                // When: Resolving service names
                const result = resolveServiceNames(backendId, mockBackends, mockServices);

                // Then: Should return empty array
                expect(result).toEqual([]);
            });
        });

        describe('filtering unknown services', () => {
            it('should filter out service IDs that do not exist in services map', () => {
                // Given: Backend with some unknown service IDs
                const backendsWithUnknown: ComponentData[] = [
                    {
                        id: 'test-backend',
                        name: 'Test Backend',
                        configuration: {
                            requiredServices: ['commerce-service', 'unknown-service', 'catalog-service'],
                        },
                    },
                ];

                // When: Resolving service names
                const result = resolveServiceNames('test-backend', backendsWithUnknown, mockServices);

                // Then: Should only return known services
                expect(result).toEqual(['Commerce Service', 'Catalog Service']);
            });

            it('should return empty array when all service IDs are unknown', () => {
                // Given: Backend with only unknown services
                const backendsWithUnknown: ComponentData[] = [
                    {
                        id: 'test-backend',
                        name: 'Test Backend',
                        configuration: {
                            requiredServices: ['unknown1', 'unknown2'],
                        },
                    },
                ];

                // When: Resolving service names
                const result = resolveServiceNames('test-backend', backendsWithUnknown, mockServices);

                // Then: Should return empty array
                expect(result).toEqual([]);
            });
        });
    });

    describe('buildComponentInfoList', () => {
        // Fixtures for buildComponentInfoList
        const mockComponentsData: ComponentsData = {
            frontends: [
                { id: 'venia', name: 'Venia Storefront' },
                { id: 'luma', name: 'Luma Storefront' },
            ],
            backends: mockBackends,
            dependencies: [
                { id: 'commerce-mesh', name: 'Commerce API Mesh' },
                { id: 'demo-inspector', name: 'Demo Inspector' },
                { id: 'other-dep', name: 'Other Dependency' },
            ],
            integrations: [
                { id: 'analytics', name: 'Adobe Analytics' },
                { id: 'target', name: 'Adobe Target' },
            ],
            appBuilder: [
                { id: 'custom-app', name: 'Custom App' },
            ],
            services: mockServices,
        };

        describe('frontend component', () => {
            it('should include frontend when selected', () => {
                // Given: State with frontend selected
                const state = {
                    components: {
                        frontend: 'venia',
                    },
                };

                // When: Building component info list
                const result = buildComponentInfoList(
                    state.components,
                    undefined, // meshStatus
                    mockComponentsData,
                    false, // hasDemoInspector
                    [], // backendServiceNames
                );

                // Then: Should include frontend info
                const frontendItem = result.find((item) => item.label === 'Frontend');
                expect(frontendItem).toBeDefined();
                expect(frontendItem?.value).toBe('Venia Storefront');
            });

            it('should include Demo Inspector sub-item when enabled', () => {
                // Given: State with frontend and demo inspector
                const state = {
                    components: {
                        frontend: 'venia',
                        dependencies: ['demo-inspector'],
                    },
                };

                // When: Building component info list
                const result = buildComponentInfoList(
                    state.components,
                    undefined,
                    mockComponentsData,
                    true, // hasDemoInspector
                    [],
                );

                // Then: Frontend should have Demo Inspector sub-item
                const frontendItem = result.find((item) => item.label === 'Frontend');
                expect(frontendItem?.subItems).toEqual(['Demo Inspector']);
            });

            it('should NOT include Demo Inspector sub-item when not enabled', () => {
                // Given: State with frontend but no demo inspector
                const state = {
                    components: {
                        frontend: 'venia',
                    },
                };

                // When: Building component info list
                const result = buildComponentInfoList(
                    state.components,
                    undefined,
                    mockComponentsData,
                    false, // hasDemoInspector
                    [],
                );

                // Then: Frontend should have no sub-items
                const frontendItem = result.find((item) => item.label === 'Frontend');
                expect(frontendItem?.subItems).toBeUndefined();
            });
        });

        describe('middleware (API Mesh)', () => {
            it('should include middleware when commerce-mesh is in dependencies', () => {
                // Given: State with commerce-mesh dependency
                const state = {
                    components: {
                        dependencies: ['commerce-mesh'],
                    },
                };

                // When: Building component info list
                const result = buildComponentInfoList(
                    state.components,
                    undefined,
                    mockComponentsData,
                    false,
                    [],
                );

                // Then: Should include middleware info
                const middlewareItem = result.find((item) => item.label === 'Middleware');
                expect(middlewareItem).toBeDefined();
            });

            it('should show deployed status when mesh is deployed', () => {
                // Given: State with mesh deployed
                const state = {
                    components: {
                        dependencies: ['commerce-mesh'],
                    },
                };

                // When: Building component info list with deployed mesh status
                const result = buildComponentInfoList(
                    state.components,
                    'deployed', // meshStatus
                    mockComponentsData,
                    false,
                    [],
                );

                // Then: Middleware value should be a React element indicating deployment
                const middlewareItem = result.find((item) => item.label === 'Middleware');
                expect(middlewareItem).toBeDefined();
                // The value will be a React element, so we check it exists
                expect(middlewareItem?.value).toBeDefined();
            });

            it('should NOT include middleware when commerce-mesh is not selected', () => {
                // Given: State without commerce-mesh
                const state = {
                    components: {
                        dependencies: ['other-dep'],
                    },
                };

                // When: Building component info list
                const result = buildComponentInfoList(
                    state.components,
                    undefined,
                    mockComponentsData,
                    false,
                    [],
                );

                // Then: Should NOT include middleware
                const middlewareItem = result.find((item) => item.label === 'Middleware');
                expect(middlewareItem).toBeUndefined();
            });
        });

        describe('backend component', () => {
            it('should include backend when selected', () => {
                // Given: State with backend selected
                const state = {
                    components: {
                        backend: 'adobe-commerce',
                    },
                };

                // When: Building component info list
                const result = buildComponentInfoList(
                    state.components,
                    undefined,
                    mockComponentsData,
                    false,
                    [],
                );

                // Then: Should include backend info
                const backendItem = result.find((item) => item.label === 'Backend');
                expect(backendItem).toBeDefined();
                expect(backendItem?.value).toBe('Adobe Commerce');
            });

            it('should include service names as sub-items', () => {
                // Given: State with backend and services
                const state = {
                    components: {
                        backend: 'adobe-commerce',
                    },
                };
                const serviceNames = ['Commerce Service', 'Catalog Service'];

                // When: Building component info list
                const result = buildComponentInfoList(
                    state.components,
                    undefined,
                    mockComponentsData,
                    false,
                    serviceNames,
                );

                // Then: Backend should have service names as sub-items
                const backendItem = result.find((item) => item.label === 'Backend');
                expect(backendItem?.subItems).toEqual(serviceNames);
            });

            it('should NOT include sub-items when no services', () => {
                // Given: State with backend but no services
                const state = {
                    components: {
                        backend: 'mock-backend',
                    },
                };

                // When: Building component info list
                const result = buildComponentInfoList(
                    state.components,
                    undefined,
                    mockComponentsData,
                    false,
                    [],
                );

                // Then: Backend should have no sub-items
                const backendItem = result.find((item) => item.label === 'Backend');
                expect(backendItem?.subItems).toBeUndefined();
            });
        });

        describe('other dependencies', () => {
            it('should include other dependencies excluding mesh and demo-inspector', () => {
                // Given: State with multiple dependencies
                const state = {
                    components: {
                        dependencies: ['commerce-mesh', 'demo-inspector', 'other-dep'],
                    },
                };

                // When: Building component info list
                const result = buildComponentInfoList(
                    state.components,
                    undefined,
                    mockComponentsData,
                    true,
                    [],
                );

                // Then: Dependencies should only include 'other-dep'
                const depsItem = result.find((item) => item.label === 'Dependencies');
                expect(depsItem).toBeDefined();
                expect(depsItem?.value).toBe('Other Dependency');
            });

            it('should NOT include Dependencies section if only mesh and demo-inspector selected', () => {
                // Given: State with only mesh and demo-inspector
                const state = {
                    components: {
                        dependencies: ['commerce-mesh', 'demo-inspector'],
                    },
                };

                // When: Building component info list
                const result = buildComponentInfoList(
                    state.components,
                    undefined,
                    mockComponentsData,
                    true,
                    [],
                );

                // Then: Should NOT include Dependencies section
                const depsItem = result.find((item) => item.label === 'Dependencies');
                expect(depsItem).toBeUndefined();
            });
        });

        describe('integrations', () => {
            it('should include integrations when selected', () => {
                // Given: State with integrations
                const state = {
                    components: {
                        integrations: ['analytics', 'target'],
                    },
                };

                // When: Building component info list
                const result = buildComponentInfoList(
                    state.components,
                    undefined,
                    mockComponentsData,
                    false,
                    [],
                );

                // Then: Should include integrations
                const integrationsItem = result.find((item) => item.label === 'Integrations');
                expect(integrationsItem).toBeDefined();
                expect(integrationsItem?.value).toBe('Adobe Analytics, Adobe Target');
            });

            it('should NOT include Integrations section when none selected', () => {
                // Given: State with no integrations
                const state = {
                    components: {},
                };

                // When: Building component info list
                const result = buildComponentInfoList(
                    state.components,
                    undefined,
                    mockComponentsData,
                    false,
                    [],
                );

                // Then: Should NOT include Integrations section
                const integrationsItem = result.find((item) => item.label === 'Integrations');
                expect(integrationsItem).toBeUndefined();
            });
        });

        describe('app builder', () => {
            it('should include App Builder apps when selected', () => {
                // Given: State with app builder apps
                const state = {
                    components: {
                        appBuilder: ['custom-app'],
                    },
                };

                // When: Building component info list
                const result = buildComponentInfoList(
                    state.components,
                    undefined,
                    mockComponentsData,
                    false,
                    [],
                );

                // Then: Should include App Builder section
                const appBuilderItem = result.find((item) => item.label === 'App Builder');
                expect(appBuilderItem).toBeDefined();
                expect(appBuilderItem?.value).toBe('Custom App');
            });

            it('should NOT include App Builder section when none selected', () => {
                // Given: State with no app builder apps
                const state = {
                    components: {},
                };

                // When: Building component info list
                const result = buildComponentInfoList(
                    state.components,
                    undefined,
                    mockComponentsData,
                    false,
                    [],
                );

                // Then: Should NOT include App Builder section
                const appBuilderItem = result.find((item) => item.label === 'App Builder');
                expect(appBuilderItem).toBeUndefined();
            });
        });

        describe('empty/undefined handling', () => {
            it('should return empty array when components is undefined', () => {
                // Given: Undefined components
                const result = buildComponentInfoList(
                    undefined,
                    undefined,
                    mockComponentsData,
                    false,
                    [],
                );

                // Then: Should return empty array
                expect(result).toEqual([]);
            });

            it('should return empty array when componentsData is undefined', () => {
                // Given: State but no components data
                const state = {
                    components: {
                        frontend: 'venia',
                    },
                };

                // When: Building component info list
                const result = buildComponentInfoList(
                    state.components,
                    undefined,
                    undefined,
                    false,
                    [],
                );

                // Then: Should return empty array
                expect(result).toEqual([]);
            });

            it('should handle empty components object', () => {
                // Given: Empty components object
                const result = buildComponentInfoList(
                    {},
                    undefined,
                    mockComponentsData,
                    false,
                    [],
                );

                // Then: Should return empty array
                expect(result).toEqual([]);
            });
        });

        describe('result ordering', () => {
            it('should maintain consistent order: Frontend, Middleware, Backend, Dependencies, Integrations, App Builder', () => {
                // Given: State with all component types
                const state = {
                    components: {
                        frontend: 'venia',
                        backend: 'adobe-commerce',
                        dependencies: ['commerce-mesh', 'other-dep'],
                        integrations: ['analytics'],
                        appBuilder: ['custom-app'],
                    },
                };

                // When: Building component info list
                const result = buildComponentInfoList(
                    state.components,
                    undefined,
                    mockComponentsData,
                    false,
                    [],
                );

                // Then: Order should be consistent
                const labels = result.map((item) => item.label);
                expect(labels).toEqual([
                    'Frontend',
                    'Middleware',
                    'Backend',
                    'Dependencies',
                    'Integrations',
                    'App Builder',
                ]);
            });
        });
    });
});
