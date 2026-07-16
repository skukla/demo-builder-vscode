/**
 * useConfigureFields Tests
 *
 * Pins the MESH_ENDPOINT special-case in getFieldValue: the endpoint is
 * auto-populated from the project's mesh deployment record, which as of
 * ADR-011 D3 Steps 07+09 lives on the KEYED `appBuilderComponents` mesh entry
 * (the webview receives the serialized project, so after Step 07 the legacy
 * `meshState` is absent there too).
 */

import { renderHook } from '@testing-library/react';
import { useConfigureFields } from '@/features/dashboard/ui/configure/hooks/useConfigureFields';
import type { UniqueField } from '@/features/dashboard/ui/configure/configureTypes';
import type { Project } from '@/types/base';

const meshEndpointField: UniqueField = {
    key: 'MESH_ENDPOINT',
    label: 'Mesh Endpoint',
    type: 'url',
    required: false,
    componentIds: ['eds-storefront'],
} as UniqueField;

function makeProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'demo',
        path: '/tmp/demo',
        status: 'stopped',
        created: new Date(),
        lastModified: new Date(),
        ...overrides,
    } as Project;
}

function renderFields(project: Project, componentConfigs: Record<string, Record<string, string>> = {}) {
    return renderHook(() =>
        useConfigureFields({
            componentConfigs,
            setComponentConfigs: jest.fn(),
            setTouchedFields: jest.fn(),
            project,
        }),
    );
}

describe('useConfigureFields — getFieldValue MESH_ENDPOINT', () => {
    it('returns the endpoint from the legacy meshState (pre-migration project)', () => {
        const project = makeProject({
            meshState: {
                envVars: {},
                sourceHash: null,
                lastDeployed: '2026-06-20T00:00:00.000Z',
                endpoint: 'https://legacy-mesh.adobe.io/graphql',
            },
        });

        const { result } = renderFields(project);

        expect(result.current.getFieldValue(meshEndpointField)).toBe(
            'https://legacy-mesh.adobe.io/graphql',
        );
    });

    it('returns the endpoint from the keyed mesh entry (keyed-only project, Steps 07+09)', () => {
        const project = makeProject({
            appBuilderComponents: {
                mesh: {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                    endpoint: 'https://keyed-mesh.adobe.io/graphql',
                },
            },
        });

        const { result } = renderFields(project);

        expect(result.current.getFieldValue(meshEndpointField)).toBe(
            'https://keyed-mesh.adobe.io/graphql',
        );
    });

    it('falls back to componentConfigs when the project has no mesh deployment record', () => {
        const project = makeProject();

        const { result } = renderFields(project, {
            'eds-storefront': { MESH_ENDPOINT: 'https://configured-mesh.adobe.io/graphql' },
        });

        expect(result.current.getFieldValue(meshEndpointField)).toBe(
            'https://configured-mesh.adobe.io/graphql',
        );
    });
});
