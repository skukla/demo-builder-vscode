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
    resolveReviewIntegrationNames,
    resolveServiceNames,
} from '@/features/project-creation/ui/steps/reviewStepHelpers';
import type {
    ComponentData,
    ComponentsData,
} from '@/features/project-creation/ui/steps/ReviewStep';

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
            const result = resolveServiceNames(
                'test-backend',
                backendsWithUnknownService,
                mockServices
            );
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
            dependencies: [{ id: 'other-dep', name: 'Other Dependency' }],
            mesh: [{ id: 'eds-commerce-mesh', name: 'EDS Commerce API Mesh' }],
            integrations: [
                { id: 'analytics', name: 'Adobe Analytics' },
                { id: 'target', name: 'Adobe Target' },
            ],
            appBuilder: [{ id: 'custom-app', name: 'Custom App' }],
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
                    [] // backendServiceNames
                );

                // Then: Should include frontend info
                const frontendItem = result.find((item) => item.label === 'Frontend');
                expect(frontendItem).toBeDefined();
                expect(frontendItem?.value).toBe('Venia Storefront');
            });

            it('should NOT include Demo Inspector sub-item (removed from extension)', () => {
                // Given: State with frontend
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
                    []
                );

                // Then: Frontend should have no sub-items (demo-inspector removed)
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
                    []
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
                    []
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
                    []
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
                    []
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
                    ['Catalog Service', 'Live Search'] // backendServiceNames
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
                    [] // backendServiceNames
                );

                // Then: Backend should have no sub-items
                const backendItem = result.find((item) => item.label === 'Backend');
                expect(backendItem).toBeDefined();
                expect(backendItem?.subItems).toBeUndefined();
            });
        });

        describe('other dependencies', () => {
            it('should include other dependencies excluding mesh', () => {
                // Given: State with multiple dependencies
                const state = {
                    components: {
                        dependencies: ['eds-commerce-mesh', 'other-dep'],
                    },
                };

                // When: Building component info list
                const result = buildComponentInfoList(
                    state.components,
                    undefined,
                    mockComponentsData,
                    []
                );

                // Then: Dependencies should only include 'other-dep' (mesh shown separately)
                const depsItem = result.find((item) => item.label === 'Dependencies');
                expect(depsItem).toBeDefined();
                expect(depsItem?.value).toBe('Other Dependency');
            });

            it('should NOT include Dependencies section if only mesh selected', () => {
                // Given: State with only mesh
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
                    []
                );

                // Then: Should NOT include Dependencies section
                const depsItem = result.find((item) => item.label === 'Dependencies');
                expect(depsItem).toBeUndefined();
            });
        });

        describe('integrations (resolved from the live wizard selection)', () => {
            // The old blocks here drove `components.integrations` /
            // `components.appBuilder` — fields the ONLY production caller never
            // populates (ReviewStep builds {frontend, backend, dependencies} and
            // buildProjectConfig hardcodes both to []). Those tests passed for
            // months while the Review screen showed nothing: a mock cannot see a
            // malformed CALL. The helper now takes the resolved names instead,
            // and ReviewStep feeds it from resolveIntegrationRows — the same
            // spine the builder summary and IntegrationsStep render from.
            it('renders one Integrations row from the resolved names', () => {
                const result = buildComponentInfoList(
                    { frontend: 'venia' },
                    undefined,
                    mockComponentsData,
                    [],
                    ['ERP Sync', 'Custom Integration']
                );

                const integrationsItem = result.find((item) => item.label === 'Integrations');
                expect(integrationsItem).toBeDefined();
                expect(integrationsItem?.value).toBe('ERP Sync, Custom Integration');
            });

            it('renders no Integrations row when no names are resolved', () => {
                const result = buildComponentInfoList(
                    { frontend: 'venia' },
                    undefined,
                    mockComponentsData,
                    [],
                    []
                );

                expect(result.find((item) => item.label === 'Integrations')).toBeUndefined();
            });

            it('ignores the dead legacy fields — names are the only input', () => {
                // Pins the removal: components.integrations / components.appBuilder
                // must no longer produce rows even when set, so the dead path
                // cannot silently come back beside the live one.
                const result = buildComponentInfoList(
                    {
                        integrations: ['analytics'],
                        appBuilder: ['custom-app'],
                    } as never,
                    undefined,
                    mockComponentsData,
                    []
                );

                expect(result.find((item) => item.label === 'Integrations')).toBeUndefined();
                expect(result.find((item) => item.label === 'App Builder')).toBeUndefined();
            });
        });

        describe('empty/undefined handling', () => {
            it('should return empty array when components is undefined', () => {
                // Given: Undefined components
                const result = buildComponentInfoList(undefined, undefined, mockComponentsData, []);

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
                const result = buildComponentInfoList(state.components, undefined, undefined, []);

                // Then: Should return empty array
                expect(result).toEqual([]);
            });

            it('should handle empty components object', () => {
                // Given: Empty components object
                const result = buildComponentInfoList({}, undefined, mockComponentsData, []);

                // Then: Should return empty array
                expect(result).toEqual([]);
            });
        });

        describe('result ordering', () => {
            it('should maintain consistent order: Frontend, Middleware, Backend, Dependencies, Integrations', () => {
                // Given: State with all component types + resolved integration names
                const state = {
                    components: {
                        frontend: 'venia',
                        backend: 'adobe-commerce',
                        dependencies: ['eds-commerce-mesh', 'other-dep'],
                    },
                };

                // When: Building component info list
                const result = buildComponentInfoList(
                    state.components,
                    undefined,
                    mockComponentsData,
                    [],
                    ['ERP Sync']
                );

                // Then: Order should be consistent
                const labels = result.map((item) => item.label);
                expect(labels).toEqual([
                    'Frontend',
                    'Middleware',
                    'Backend',
                    'Dependencies',
                    'Integrations',
                ]);
            });
        });
    });

    describe('resolveReviewIntegrationNames', () => {
        // Drives the REAL resolver spine (resolveIntegrationRows) with the REAL
        // bundled catalog — the mocked-vs-bundled-JSON trap: `app-builder-shell`
        // is the one genuine `kind: 'integration'` entry, and inventing catalog
        // ids here would test a catalog that does not exist.
        it('resolves a custom import to its display name, falling back to the repo', () => {
            const state = {
                selectedAppBuilderComponents: ['erp-sync-import', 'crm-import'],
                appBuilderComponentSources: {
                    'erp-sync-import': { owner: 'acme', repo: 'erp-sync', name: 'ERP Sync' },
                    'crm-import': { owner: 'acme', repo: 'crm-connector' },
                },
            };

            expect(resolveReviewIntegrationNames(state as never, [], [])).toEqual([
                'ERP Sync',
                'crm-connector',
            ]);
        });

        it('resolves the blank shell catalog entry by its catalog name', () => {
            // Real bundled id — resolves via the entry.blank branch.
            const state = {
                selectedAppBuilderComponents: ['app-builder-shell'],
                appBuilderComponentSources: {},
            };

            expect(resolveReviewIntegrationNames(state as never, [], [])).toEqual([
                'Custom Integration',
            ]);
        });

        it('excludes unknown ids and returns [] for an empty selection', () => {
            // An id with no source and no catalog entry cannot be named — the
            // row resolver drops it, and Review must not render a raw id.
            const state = {
                selectedAppBuilderComponents: ['not-a-real-entry'],
                appBuilderComponentSources: {},
            };

            expect(resolveReviewIntegrationNames(state as never, [], [])).toEqual([]);
            expect(resolveReviewIntegrationNames({} as never, [], [])).toEqual([]);
        });
    });
});
