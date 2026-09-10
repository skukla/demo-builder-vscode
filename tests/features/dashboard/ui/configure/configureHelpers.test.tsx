/**
 * configureHelpers — what the Configure screen decides a project HAS to configure.
 *
 * Three jobs, and until 2026-09-06 only the first had a test. `hasComponentEnvVars`
 * is the accessor that flattens three levels of optional chaining into one
 * question. The other two are the fallback the screen runs for a project with no
 * recorded selections: flatten the catalog, then keep the component instances
 * whose definition actually asks for something. That fallback is what an older
 * project falls back TO, so a silent empty answer there shows as a Configure
 * screen with nothing on it.
 */

import {
    discoverComponentsFromInstances,
    getAllComponentDefinitions,
    hasComponentEnvVars,
} from '@/features/dashboard/ui/configure/configureHelpers';
import type { ComponentsData } from '@/features/dashboard/ui/configure/configureTypes';
import type { TransformedComponentDefinition } from '@/types/components';

/** A definition that asks for env vars, so the discovery keeps it. */
const withEnvVars = (id: string): TransformedComponentDefinition => ({
    id,
    name: id,
    configuration: { requiredEnvVars: [`${id.toUpperCase()}_URL`] },
});

/** A definition that asks for nothing, so the discovery drops it. */
const withoutEnvVars = (id: string): TransformedComponentDefinition => ({ id, name: id });

/**
 * The wire's shape, with only the categories a test cares about filled in.
 *
 * `frontends`, `backends`, `dependencies` and `envVars` are REQUIRED on the real
 * payload — `mesh` and `integrations` are the two an older project can arrive
 * without, which is the case the skip test is about.
 */
const componentsData = (over: Partial<ComponentsData> = {}): ComponentsData => ({
    frontends: [],
    backends: [],
    dependencies: [],
    envVars: {},
    ...over,
});

describe('hasComponentEnvVars', () => {
    describe('one component at a time', () => {
        it('should return true when required env vars are present', () => {
            // Given: A component with required environment variables
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                configuration: {
                    requiredEnvVars: ['API_KEY', 'SECRET_KEY'],
                },
            };

            // When: Checking if component has env vars
            const result = hasComponentEnvVars(componentDef);

            // Then: Should return true
            expect(result).toBe(true);
        });

        it('should return true when optional env vars are present', () => {
            // Given: A component with optional environment variables
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                configuration: {
                    optionalEnvVars: ['DEBUG_MODE', 'LOG_LEVEL'],
                },
            };

            // When: Checking if component has env vars
            const result = hasComponentEnvVars(componentDef);

            // Then: Should return true
            expect(result).toBe(true);
        });

        it('should return true when both required and optional env vars are present', () => {
            // Given: A component with both required and optional environment variables
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                configuration: {
                    requiredEnvVars: ['API_KEY'],
                    optionalEnvVars: ['DEBUG_MODE'],
                },
            };

            // When: Checking if component has env vars
            const result = hasComponentEnvVars(componentDef);

            // Then: Should return true
            expect(result).toBe(true);
        });

        it('should return false when no env vars are configured', () => {
            // Given: A component with no environment variables
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                configuration: {},
            };

            // When: Checking if component has env vars
            const result = hasComponentEnvVars(componentDef);

            // Then: Should return false
            expect(result).toBe(false);
        });

        it('should return false when configuration is undefined', () => {
            // Given: A component with no configuration
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
            };

            // When: Checking if component has env vars
            const result = hasComponentEnvVars(componentDef);

            // Then: Should return false
            expect(result).toBe(false);
        });

        it('should return false when component is undefined', () => {
            // Given: An undefined component
            const componentDef = undefined;

            // When: Checking if component has env vars
            const result = hasComponentEnvVars(componentDef);

            // Then: Should return false
            expect(result).toBe(false);
        });

        it('should return false when env var arrays are empty', () => {
            // Given: A component with empty env var arrays
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                configuration: {
                    requiredEnvVars: [],
                    optionalEnvVars: [],
                },
            };

            // When: Checking if component has env vars
            const result = hasComponentEnvVars(componentDef);

            // Then: Should return false
            expect(result).toBe(false);
        });

        it('should return false when requiredEnvVars is undefined and optionalEnvVars is empty', () => {
            // Given: A component with undefined required and empty optional env vars
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                configuration: {
                    optionalEnvVars: [],
                },
            };

            // When: Checking if component has env vars
            const result = hasComponentEnvVars(componentDef);

            // Then: Should return false
            expect(result).toBe(false);
        });

        it('should return false when optionalEnvVars is undefined and requiredEnvVars is empty', () => {
            // Given: A component with empty required and undefined optional env vars
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                configuration: {
                    requiredEnvVars: [],
                },
            };

            // When: Checking if component has env vars
            const result = hasComponentEnvVars(componentDef);

            // Then: Should return false
            expect(result).toBe(false);
        });

        describe('real-world scenarios', () => {
            it('should handle typical frontend component with API endpoint vars', () => {
                // Given: A typical frontend component configuration
                const componentDef: TransformedComponentDefinition = {
                    id: 'headless',
                    name: 'CitiSignal NextJS Frontend',
                    configuration: {
                        requiredEnvVars: ['NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_MESH_ENDPOINT'],
                        optionalEnvVars: ['NEXT_PUBLIC_ANALYTICS_ID'],
                    },
                };

                // When: Checking if component has env vars
                const result = hasComponentEnvVars(componentDef);

                // Then: Should return true
                expect(result).toBe(true);
            });

            it('should handle backend service with authentication vars', () => {
                // Given: A backend service with auth configuration
                const componentDef: TransformedComponentDefinition = {
                    id: 'adobe-commerce-paas',
                    name: 'Adobe Commerce PaaS',
                    configuration: {
                        requiredEnvVars: ['SERVICE_CLIENT_ID', 'SERVICE_CLIENT_SECRET'],
                    },
                };

                // When: Checking if component has env vars
                const result = hasComponentEnvVars(componentDef);

                // Then: Should return true
                expect(result).toBe(true);
            });

            it('should handle component with only optional debug vars', () => {
                // Given: A component with only debug variables
                const componentDef: TransformedComponentDefinition = {
                    id: 'debug-utility',
                    name: 'Debug Utility',
                    configuration: {
                        optionalEnvVars: ['DEBUG', 'LOG_LEVEL', 'TRACE_ENABLED'],
                    },
                };

                // When: Checking if component has env vars
                const result = hasComponentEnvVars(componentDef);

                // Then: Should return true (optional env vars still count)
                expect(result).toBe(true);
            });

            it('should handle component without any configuration', () => {
                // Given: A basic component without configuration
                const componentDef: TransformedComponentDefinition = {
                    id: 'static-assets',
                    name: 'Static Assets',
                    description: 'Static assets component with no configuration',
                };

                // When: Checking if component has env vars
                const result = hasComponentEnvVars(componentDef);

                // Then: Should return false
                expect(result).toBe(false);
            });
        });
    });
});

describe('getAllComponentDefinitions', () => {
    it('flattens every category, in catalog order', () => {
        const data = componentsData({
            frontends: [withEnvVars('headless')],
            backends: [withEnvVars('adobe-commerce-paas')],
            dependencies: [withEnvVars('catalog-service')],
            mesh: [withEnvVars('api-mesh')],
            integrations: [withEnvVars('erp')],
        });

        expect(getAllComponentDefinitions(data).map((d) => d.id)).toStrictEqual([
            'headless',
            'adobe-commerce-paas',
            'catalog-service',
            'api-mesh',
            'erp',
        ]);
    });

    it('skips a category the wire did not send, and invents nothing for it', () => {
        // Older projects arrive without `mesh` or `integrations` at all; a
        // placeholder in their place would render as a component to configure.
        const data = componentsData({ frontends: [withEnvVars('headless')] });

        expect(getAllComponentDefinitions(data)).toStrictEqual([withEnvVars('headless')]);
    });

    it('answers with an empty list when nothing was sent', () => {
        expect(getAllComponentDefinitions(componentsData())).toStrictEqual([]);
    });
});

describe('discoverComponentsFromInstances', () => {
    it('keeps the instances whose definition asks for something, and only those', () => {
        const erp = withEnvVars('erp');

        const discovered = discoverComponentsFromInstances(
            { erp: { type: 'integration' }, storefront: { type: 'frontend' } },
            [erp, withoutEnvVars('storefront')]
        );

        expect(discovered).toStrictEqual([{ id: 'erp', data: erp, type: 'Integration' }]);
    });

    it('matches an instance to its OWN definition, not merely the first one', () => {
        const erp = withEnvVars('erp');

        const discovered = discoverComponentsFromInstances({ erp: { type: 'integration' } }, [
            withEnvVars('crm'),
            erp,
        ]);

        expect(discovered).toStrictEqual([{ id: 'erp', data: erp, type: 'Integration' }]);
    });

    it('drops an instance the catalog no longer describes', () => {
        // A component removed from the catalog between releases still sits in an
        // existing project's state; it has no fields to draw.
        expect(
            discoverComponentsFromInstances({ erp: { type: 'integration' } }, [withEnvVars('crm')])
        ).toStrictEqual([]);
    });

    it('capitalises the instance type for display, leaving the rest of the word alone', () => {
        const mesh = withEnvVars('api-mesh');

        const discovered = discoverComponentsFromInstances({ 'api-mesh': { type: 'dependency' } }, [
            mesh,
        ]);

        expect(discovered[0].type).toBe('Dependency');
    });

    it('falls back to "Component" when the instance records no type', () => {
        const mesh = withEnvVars('api-mesh');

        const discovered = discoverComponentsFromInstances({ 'api-mesh': {} }, [mesh]);

        expect(discovered[0].type).toBe('Component');
    });

    it('answers with an empty list when the project has no instances', () => {
        expect(discoverComponentsFromInstances({}, [withEnvVars('erp')])).toStrictEqual([]);
    });
});
