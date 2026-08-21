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
import type { ComponentsData } from '@/features/dashboard/ui/configure/configureTypes';
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
    } as ComponentsData['envVars'],
};

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
});
