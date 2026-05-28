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
            }),
        );

        const meshSection = result.current.find(group => group.id === 'mesh');
        expect(meshSection).toBeUndefined();
    });

    it('does not include MESH_ENDPOINT in any section when mesh is absent', () => {
        const { result } = renderHook(() =>
            useServiceGroups({
                selectedComponents: [edsStorefrontNoMesh, accsBackend],
                componentsData,
            }),
        );

        const allFieldKeys = result.current.flatMap(group => group.fields.map(f => f.key));
        expect(allFieldKeys).not.toContain('MESH_ENDPOINT');
    });

    it('keeps other sections for the same project (Adobe Commerce Cloud Service, Adobe Assets)', () => {
        const { result } = renderHook(() =>
            useServiceGroups({
                selectedComponents: [edsStorefrontNoMesh, accsBackend],
                componentsData,
            }),
        );

        const groupIds = result.current.map(g => g.id);
        expect(groupIds).toContain('accs');
        expect(groupIds).toContain('adobe-assets');
    });

    it('includes the API Mesh section when a mesh component is selected', () => {
        const { result } = renderHook(() =>
            useServiceGroups({
                selectedComponents: [edsStorefrontNoMesh, accsBackend, accsMesh],
                componentsData,
            }),
        );

        const meshSection = result.current.find(group => group.id === 'mesh');
        expect(meshSection).toBeDefined();
        expect(meshSection?.fields.some(f => f.key === 'MESH_ENDPOINT')).toBe(true);
    });
});
