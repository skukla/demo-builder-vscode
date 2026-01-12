/**
 * ReviewStep Helper Tests
 *
 * Tests for buildComponentInfoList helper that extracts
 * complex logic from the ReviewStep component's useMemo hooks.
 *
 * Follows TDD methodology - tests written BEFORE implementation.
 */

import {
    buildComponentInfoList,
    resolveServiceNames,
    type ComponentInfoItem,
} from '@/features/project-creation/ui/steps/reviewStepHelpers';
import type { ComponentData, ComponentsData } from '@/features/project-creation/ui/steps/ReviewStep';

describe('reviewStepHelpers', () => {
    describe('resolveServiceNames', () => {
        const mockBackends: ComponentData[] = [
            {
                id: 'adobe-commerce-paas',
                name: 'Adobe Commerce PaaS',
                configuration: {
                    requiredServices: ['catalog-service', 'live-search'],
                },
            },
            {
                id: 'adobe-commerce-accs',
                name: 'Adobe Commerce Cloud Service',
                configuration: {
                    providesServices: ['catalog-service', 'live-search'],
                },
            },
        ];

        const mockServices = {
            'catalog-service': {
                name: 'Catalog Service',
                description: 'Enhanced product information management',
            },
            'live-search': {
                name: 'Live Search',
                description: 'AI-powered search with personalization',
            },
        };

        it('should resolve required service names for PaaS backend', () => {
            const result = resolveServiceNames('adobe-commerce-paas', mockBackends, mockServices);
            expect(result).toEqual(['Catalog Service', 'Live Search']);
        });

        it('should resolve provided service names with (built-in) suffix for ACCS backend', () => {
            const result = resolveServiceNames('adobe-commerce-accs', mockBackends, mockServices);
            expect(result).toEqual(['Catalog Service (built-in)', 'Live Search (built-in)']);
        });

        it('should return empty array when backendId is undefined', () => {
            const result = resolveServiceNames(undefined, mockBackends, mockServices);
            expect(result).toEqual([]);
        });

        it('should return empty array when backends is undefined', () => {
            const result = resolveServiceNames('adobe-commerce-paas', undefined, mockServices);
            expect(result).toEqual([]);
        });

        it('should return empty array when services is undefined', () => {
            const result = resolveServiceNames('adobe-commerce-paas', mockBackends, undefined);
            expect(result).toEqual([]);
        });

        it('should return empty array when backend is not found', () => {
            const result = resolveServiceNames('unknown-backend', mockBackends, mockServices);
            expect(result).toEqual([]);
        });

        it('should filter out services not found in registry', () => {
            const backendsWithUnknownService: ComponentData[] = [
                {
                    id: 'test-backend',
                    name: 'Test Backend',
                    configuration: {
                        requiredServices: ['catalog-service', 'unknown-service', 'live-search'],
                    },
                },
            ];
            const result = resolveServiceNames('test-backend', backendsWithUnknownService, mockServices);
            expect(result).toEqual(['Catalog Service', 'Live Search']);
        });
    });

    describe('buildComponentInfoList', () => {
        // Fixtures for buildComponentInfoList
        const mockBackends: ComponentData[] = [
            {
                id: 'adobe-commerce',
                name: 'Adobe Commerce',
                configuration: {},
            },
            {
                id: 'mock-backend',
                name: 'Mock Backend',
                configuration: {},
            },
        ];

        const mockComponentsData: ComponentsData = {
            frontends: [
                { id: 'venia', name: 'Venia Storefront' },
                { id: 'luma', name: 'Luma Storefront' },
            ],
            backends: mockBackends,
            dependencies: [
                { id: 'eds-commerce-mesh', name: 'EDS Commerce API Mesh' },
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
            it('should include middleware when eds-commerce-mesh is in dependencies', () => {
                // Given: State with eds-commerce-mesh dependency
                const state = {
                    components: {
                        dependencies: ['eds-commerce-mesh'],
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
                        dependencies: ['eds-commerce-mesh'],
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

            it('should NOT include middleware when eds-commerce-mesh is not selected', () => {
                // Given: State without eds-commerce-mesh
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

            it('should include backend service names when provided', () => {
                // Given: State with backend selected and service names
                const state = {
                    components: {
                        backend: 'adobe-commerce',
                    },
                };

                // When: Building component info list with backend service names
                const result = buildComponentInfoList(
                    state.components,
                    undefined,
                    mockComponentsData,
                    false,
                    ['Catalog Service', 'Live Search'], // backendServiceNames
                );

                // Then: Backend should have service sub-items
                const backendItem = result.find((item) => item.label === 'Backend');
                expect(backendItem).toBeDefined();
                expect(backendItem?.subItems).toEqual(['Catalog Service', 'Live Search']);
            });

            it('should NOT include sub-items when backend service names is empty', () => {
                // Given: State with backend selected
                const state = {
                    components: {
                        backend: 'adobe-commerce',
                    },
                };

                // When: Building component info list with empty service names
                const result = buildComponentInfoList(
                    state.components,
                    undefined,
                    mockComponentsData,
                    false,
                    [], // backendServiceNames
                );

                // Then: Backend should have no sub-items
                const backendItem = result.find((item) => item.label === 'Backend');
                expect(backendItem).toBeDefined();
                expect(backendItem?.subItems).toBeUndefined();
            });
        });

        describe('other dependencies', () => {
            it('should include other dependencies excluding mesh and demo-inspector', () => {
                // Given: State with multiple dependencies
                const state = {
                    components: {
                        dependencies: ['eds-commerce-mesh', 'demo-inspector', 'other-dep'],
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
                        dependencies: ['eds-commerce-mesh', 'demo-inspector'],
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
                        dependencies: ['eds-commerce-mesh', 'other-dep'],
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
