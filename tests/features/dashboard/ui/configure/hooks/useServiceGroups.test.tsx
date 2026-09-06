/**
 * useServiceGroups Tests
 *
 * Regression coverage: MESH_ENDPOINT is declared as an optional env var on both
 * EDS and headless frontends (it's auto-populated from `meshState.endpoint` after
 * mesh deployment). Without explicit filtering, any project using those frontends
 * showed a spurious "API Mesh" section even when no mesh component was selected.
 */

import { renderHook } from '@testing-library/react';
import { useServiceGroups } from '@/features/dashboard/ui/configure/hooks/useServiceGroups';
import type {
    ComponentsData,
    ServiceGroup,
    UniqueField,
} from '@/features/dashboard/ui/configure/configureTypes';
import type { SelectedComponent } from '@/features/dashboard/ui/configure/hooks/useSelectedComponents';

// Minimal componentsData with envVars relevant to the mesh-filtering tests.
// Only defines env vars actually referenced by the components below.
const componentsData: ComponentsData = {
    frontends: [],
    backends: [],
    dependencies: [],
    mesh: [
        {
            id: 'eds-accs-mesh',
            name: 'EDS ACCS API Mesh',
            configuration: {
                requiredEnvVars: ['ACCS_GRAPHQL_ENDPOINT'],
            },
        },
    ],
    envVars: {
        MESH_ENDPOINT: {
            key: 'MESH_ENDPOINT',
            label: 'Mesh Endpoint',
            type: 'url',
            required: false,
            group: 'mesh',
        },
        AEM_ASSETS_ENABLED: {
            key: 'AEM_ASSETS_ENABLED',
            label: 'Adobe Assets',
            type: 'text',
            required: false,
            group: 'adobe-assets',
        },
        ADOBE_CATALOG_SERVICE_ENDPOINT: {
            key: 'ADOBE_CATALOG_SERVICE_ENDPOINT',
            label: 'Catalog Service Endpoint',
            type: 'url',
            required: false,
            group: 'catalog-service',
            derivedFrom: ['PAAS_CATALOG_SERVICE_ENDPOINT', 'ACCS_CATALOG_SERVICE_ENDPOINT'],
        },
        PAAS_CATALOG_SERVICE_ENDPOINT: {
            key: 'PAAS_CATALOG_SERVICE_ENDPOINT',
            label: 'PaaS Catalog Service Endpoint',
            type: 'url',
            required: true,
            group: 'catalog-service',
        },
        ACCS_GRAPHQL_ENDPOINT: {
            key: 'ACCS_GRAPHQL_ENDPOINT',
            label: 'ACCS GraphQL Endpoint',
            type: 'url',
            required: true,
            group: 'accs',
        },
        ACCS_WEBSITE_CODE: {
            key: 'ACCS_WEBSITE_CODE',
            label: 'ACCS Website Code',
            type: 'text',
            required: true,
            group: 'accs',
        },
        UNGROUPED_SETTING: {
            key: 'UNGROUPED_SETTING',
            label: 'Ungrouped Setting',
            type: 'text',
            required: true,
        },
    } as ComponentsData['envVars'],
};

/** A component declaring exactly `envVars` as required, and nothing else. */
function componentRequiring(id: string, envVars: string[]): SelectedComponent {
    return {
        id,
        type: 'Backend',
        data: { id, name: id, configuration: { requiredEnvVars: envVars, optionalEnvVars: [] } },
    } as SelectedComponent;
}

/** Every field key the hook surfaces, across all groups. */
function keysFrom(groups: ServiceGroup[]): string[] {
    return groups.flatMap((g) => g.fields.map((f) => f.key));
}

/** The one field with `key`, wherever it landed. */
function fieldNamed(groups: ServiceGroup[], key: string): UniqueField | undefined {
    return groups.flatMap((g) => g.fields).find((f) => f.key === key);
}

const edsStorefrontNoMesh: SelectedComponent = {
    id: 'eds-storefront',
    type: 'Frontend',
    data: {
        id: 'eds-storefront',
        name: 'EDS Storefront',
        configuration: {
            requiredEnvVars: [],
            optionalEnvVars: ['MESH_ENDPOINT', 'AEM_ASSETS_ENABLED'],
        },
    },
};

const accsBackend: SelectedComponent = {
    id: 'adobe-commerce-accs',
    type: 'Backend',
    data: {
        id: 'adobe-commerce-accs',
        name: 'Adobe Commerce Cloud Service',
        configuration: {
            requiredEnvVars: ['ACCS_GRAPHQL_ENDPOINT'],
            optionalEnvVars: [],
        },
    },
};

const accsMesh: SelectedComponent = {
    id: 'eds-accs-mesh',
    type: 'Dependency',
    data: {
        id: 'eds-accs-mesh',
        name: 'EDS ACCS API Mesh',
        configuration: {
            requiredEnvVars: ['ACCS_GRAPHQL_ENDPOINT'],
            optionalEnvVars: [],
        },
    },
};

describe('useServiceGroups', () => {
    it('omits the API Mesh section when no mesh component is selected', () => {
        // b2b-demo regression: EDS frontend + ACCS backend, no mesh dep → API Mesh section appeared
        const { result } = renderHook(() =>
            useServiceGroups({
                selectedComponents: [edsStorefrontNoMesh, accsBackend],
                componentsData,
            })
        );

        const meshSection = result.current.find((group) => group.id === 'mesh');
        expect(meshSection).toBeUndefined();
    });

    /**
     * A DERIVED env var is computed by the generator, not typed by a user.
     *
     * `ADOBE_CATALOG_SERVICE_ENDPOINT` declares
     * `derivedFrom: [PAAS_…, ACCS_…]`, and `envFileGenerator` honours that when it
     * writes the `.env`. Configure rendered it anyway — blank, editable, optional,
     * and sorted ABOVE the required field it derives from — so the field a user
     * reaches for first was the one the generator intends to compute.
     *
     * The house already treats derived vars this way: the App Builder field model
     * drops its `derivedFrom` bucket entirely rather than rendering it
     * (`appBuilderComponentFieldModel.ts:40`). The wizard does not show this field
     * either. Configure was the outlier.
     */
    describe('useServiceGroups — derived fields', () => {
        const catalogBackend: SelectedComponent = {
            id: 'adobe-commerce-paas',
            type: 'Backend',
            data: {
                id: 'adobe-commerce-paas',
                name: 'Adobe Commerce PaaS',
                configuration: {
                    requiredEnvVars: ['PAAS_CATALOG_SERVICE_ENDPOINT'],
                    optionalEnvVars: ['ADOBE_CATALOG_SERVICE_ENDPOINT'],
                },
            },
        } as SelectedComponent;

        it('does not render a field the generator computes', () => {
            const { result } = renderHook(() =>
                useServiceGroups({ selectedComponents: [catalogBackend], componentsData })
            );

            const keys = result.current.flatMap((g) => g.fields.map((f) => f.key));
            expect(keys).not.toContain('ADOBE_CATALOG_SERVICE_ENDPOINT');
        });

        it('still renders the field it derives FROM — the control', () => {
            const { result } = renderHook(() =>
                useServiceGroups({ selectedComponents: [catalogBackend], componentsData })
            );

            const keys = result.current.flatMap((g) => g.fields.map((f) => f.key));
            expect(keys).toContain('PAAS_CATALOG_SERVICE_ENDPOINT');
        });
    });

    it('does not include MESH_ENDPOINT in any section when mesh is absent', () => {
        const { result } = renderHook(() =>
            useServiceGroups({
                selectedComponents: [edsStorefrontNoMesh, accsBackend],
                componentsData,
            })
        );

        const allFieldKeys = result.current.flatMap((group) => group.fields.map((f) => f.key));
        expect(allFieldKeys).not.toContain('MESH_ENDPOINT');
    });

    it('keeps other sections for the same project (Adobe Commerce Cloud Service, Adobe Assets)', () => {
        const { result } = renderHook(() =>
            useServiceGroups({
                selectedComponents: [edsStorefrontNoMesh, accsBackend],
                componentsData,
            })
        );

        const groupIds = result.current.map((g) => g.id);
        expect(groupIds).toContain('accs');
        expect(groupIds).toContain('adobe-assets');
    });

    it('omits the API Mesh section even WITH a mesh selected', () => {
        // The section used to appear whenever a mesh existed, holding one field
        // that is optional, auto-supplied by the deploy, and display-locked to the
        // deployed endpoint — so a whole rail tab for a control nobody can use.
        // The mesh's real controls are the Integrations grid, where it is the
        // first peer card. The wizard already filters the field out entirely.
        const { result } = renderHook(() =>
            useServiceGroups({
                selectedComponents: [edsStorefrontNoMesh, accsBackend, accsMesh],
                componentsData,
            })
        );

        expect(result.current.find((group) => group.id === 'mesh')).toBeUndefined();
    });

    it('never surfaces MESH_ENDPOINT in any section, mesh or no mesh', () => {
        const { result } = renderHook(() =>
            useServiceGroups({
                selectedComponents: [edsStorefrontNoMesh, accsBackend, accsMesh],
                componentsData,
            })
        );

        const everyKey = result.current.flatMap((group) => group.fields.map((f) => f.key));
        expect(everyKey).not.toContain('MESH_ENDPOINT');
        // Control: the other frontend-declared optional var still comes through,
        // so this is MESH_ENDPOINT being filtered and not the fixture collapsing.
        expect(everyKey).toContain('AEM_ASSETS_ENABLED');
    });

    // A field declared by several components is stored ONCE and accumulates their
    // ids. That list is what makes an edit fan out to every component needing the
    // value, so a second declaration must extend it rather than replace the field.
    describe('deduplicating a field across components', () => {
        it('records every component that declares the same field', () => {
            const { result } = renderHook(() =>
                useServiceGroups({
                    selectedComponents: [
                        componentRequiring('comp-a', ['ACCS_GRAPHQL_ENDPOINT']),
                        componentRequiring('comp-b', ['ACCS_GRAPHQL_ENDPOINT']),
                    ],
                    componentsData,
                })
            );

            expect(keysFrom(result.current)).toStrictEqual(['ACCS_GRAPHQL_ENDPOINT']);
            expect(fieldNamed(result.current, 'ACCS_GRAPHQL_ENDPOINT')?.componentIds).toStrictEqual(
                ['comp-a', 'comp-b']
            );
        });

        it('records a component once when it declares the field twice', () => {
            const twice: SelectedComponent = {
                id: 'comp-dup',
                type: 'Backend',
                data: {
                    id: 'comp-dup',
                    name: 'Declares it both ways',
                    configuration: {
                        requiredEnvVars: ['ACCS_GRAPHQL_ENDPOINT'],
                        optionalEnvVars: ['ACCS_GRAPHQL_ENDPOINT'],
                    },
                },
            } as SelectedComponent;

            const { result } = renderHook(() =>
                useServiceGroups({ selectedComponents: [twice], componentsData })
            );

            expect(fieldNamed(result.current, 'ACCS_GRAPHQL_ENDPOINT')?.componentIds).toStrictEqual(
                ['comp-dup']
            );
        });
    });

    describe('what does not become a field', () => {
        // A component may name an env var the registry does not define — an older
        // catalog entry, a var that has since been removed. There is nothing to
        // render for it: no label, no type, no group.
        it('skips an env var the registry does not define', () => {
            const { result } = renderHook(() =>
                useServiceGroups({
                    selectedComponents: [
                        componentRequiring('comp-stale', ['NOT_IN_THE_REGISTRY']),
                        accsBackend,
                    ],
                    componentsData,
                })
            );

            expect(keysFrom(result.current)).toStrictEqual(['ACCS_GRAPHQL_ENDPOINT']);
        });

        it('tolerates a selected component that declares no configuration at all', () => {
            const bare = {
                id: 'comp-bare',
                type: 'Frontend',
                data: { id: 'comp-bare', name: 'No configuration block' },
            } as SelectedComponent;

            const { result } = renderHook(() =>
                useServiceGroups({
                    selectedComponents: [bare, accsBackend],
                    componentsData,
                })
            );

            expect(keysFrom(result.current)).toStrictEqual(['ACCS_GRAPHQL_ENDPOINT']);
        });
    });

    describe('placing fields into groups', () => {
        it('keeps every field of a group, not just the last one', () => {
            const { result } = renderHook(() =>
                useServiceGroups({
                    selectedComponents: [
                        componentRequiring('comp-accs', [
                            'ACCS_GRAPHQL_ENDPOINT',
                            'ACCS_WEBSITE_CODE',
                        ]),
                    ],
                    componentsData,
                })
            );

            const accs = result.current.find((g) => g.id === 'accs');
            expect(accs?.fields.map((f) => f.key)).toStrictEqual([
                'ACCS_GRAPHQL_ENDPOINT',
                'ACCS_WEBSITE_CODE',
            ]);
        });

        it('files a field that declares no group under Additional Settings', () => {
            const { result } = renderHook(() =>
                useServiceGroups({
                    selectedComponents: [componentRequiring('comp-misc', ['UNGROUPED_SETTING'])],
                    componentsData,
                })
            );

            expect(result.current.map((g) => g.id)).toStrictEqual(['other']);
            expect(keysFrom(result.current)).toStrictEqual(['UNGROUPED_SETTING']);
        });
    });

    // Configure re-renders on every keystroke in a field. The memo is what keeps
    // that cheap — but a memo that never re-runs shows the OLD component's fields
    // after the user changes their selection.
    it('recomputes when the selected components change', () => {
        const { result, rerender } = renderHook(
            (props: Parameters<typeof useServiceGroups>[0]) => useServiceGroups(props),
            {
                initialProps: {
                    selectedComponents: [accsBackend],
                    componentsData,
                },
            }
        );

        expect(keysFrom(result.current)).toStrictEqual(['ACCS_GRAPHQL_ENDPOINT']);

        rerender({
            selectedComponents: [componentRequiring('comp-misc', ['UNGROUPED_SETTING'])],
            componentsData,
        });

        expect(keysFrom(result.current)).toStrictEqual(['UNGROUPED_SETTING']);
    });
});
