/**
 * Two decisions the verifier makes that nothing was checking: recovering a mesh
 * id a project never stored, and deciding whether a keyed record counts as
 * evidence that a deployment happened.
 *
 * The recovery path is self-healing for projects created before the mesh id was
 * written into component metadata — it asks Adobe I/O for the id, writes it
 * back, and flags the result as recovered so the caller can persist it. The
 * evidence rule matters in the other direction: syncMeshStatus leaves a CLEARED
 * `not-deployed` shell behind when a remote mesh is gone, and the existence of
 * that shell must not, on the next verify, promote the component back to
 * deployed.
 *
 * Everything here asserts what the verifier WROTE, not what a mock answered.
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { AppBuilderComponentState } from '@/types/base';
import {
    createMockProject,
    setupMeshVerifier,
    syncMeshStatus,
    verifyMeshDeployment,
    type MeshCommandExecutorFake,
} from './meshVerifier.testUtils';
import { createSuccessResult } from '../../../helpers/commandResultFake';

let mockCommandManager: MeshCommandExecutorFake;

/** A project whose mesh component carries `metadata`, or none. */
function projectWithMesh(metadata?: Record<string, unknown>) {
    return createMockProject({
        componentInstances: {
            'commerce-mesh': {
                id: 'commerce-mesh',
                name: 'API Mesh',
                subType: 'mesh' as const,
                path: '/test/mesh',
                status: 'ready' as const,
                ...(metadata ? { metadata } : {}),
            },
        },
    });
}

/** The identity half of a keyed record — what survives a sync-gone clear. */
const MESH_SOURCE = { owner: 'adobe', repo: 'commerce-mesh' };

/** A project with a mesh component and one keyed mesh record. */
function projectWithRecord(record: Partial<AppBuilderComponentState>) {
    return createMockProject({
        componentInstances: {
            'commerce-mesh': {
                id: 'commerce-mesh',
                name: 'API Mesh',
                subType: 'mesh' as const,
                path: '/test/mesh',
                status: 'ready' as const,
                metadata: { meshId: 'mesh123' },
            },
        },
        appBuilderComponents: {
            mesh: {
                kind: 'mesh',
                status: 'not-deployed',
                source: MESH_SOURCE,
                ...record,
            },
        },
    });
}

beforeEach(() => {
    ({ mockCommandManager } = setupMeshVerifier());
});

describe('recovering a mesh id the project never stored', () => {
    // The ids below are hex: the listing regex captures [a-f0-9-]+, which is
    // what a real mesh id is. A non-hex id is not matched and the recovery
    // silently reports nothing.
    it('writes the recovered id and its status onto the component metadata', async () => {
        // Self-healing for projects created before the id was persisted. Without
        // the write-back, every later verify pays for the recovery again.
        const project = projectWithMesh();
        mockCommandManager.execute.mockResolvedValue(
            createSuccessResult('Mesh ID: abc123\nEndpoint: https://mesh.example/graphql'),
        );

        await verifyMeshDeployment(project, mockCommandManager);

        expect(project.componentInstances?.['commerce-mesh'].metadata).toMatchObject({
            meshId: 'abc123',
            meshStatus: 'deployed',
        });
    });

    it('keeps the metadata the component already had', async () => {
        // The metadata record carries more than the mesh id; replacing it
        // wholesale loses whatever else installation put there.
        const project = projectWithMesh({ installedVersion: '2.1.0' });
        mockCommandManager.execute.mockResolvedValue(
            createSuccessResult('Mesh ID: abc123'),
        );

        await verifyMeshDeployment(project, mockCommandManager);

        expect(project.componentInstances?.['commerce-mesh'].metadata).toMatchObject({
            installedVersion: '2.1.0',
            meshId: 'abc123',
        });
    });

    it('flags the result as recovered, so the caller knows to persist it', async () => {
        const project = projectWithMesh();
        mockCommandManager.execute.mockResolvedValue(
            createSuccessResult('Mesh ID: abc123'),
        );

        const result = await verifyMeshDeployment(project, mockCommandManager);

        expect(result.data?.meshIdRecovered).toBe(true);
    });

    it('does NOT flag a verification that used the stored id', async () => {
        // The complement: without it, "recovered" would pass while being set on
        // every verification, and every caller would rewrite the project.
        const project = projectWithMesh({ meshId: 'mesh123' });
        mockCommandManager.execute.mockResolvedValue(createSuccessResult('Mesh ID: mesh123'));

        const result = await verifyMeshDeployment(project, mockCommandManager);

        expect(result.data?.meshIdRecovered).toBe(false);
    });

    it('reports the missing id when Adobe I/O has no mesh to recover from', async () => {
        const project = projectWithMesh();
        mockCommandManager.execute.mockResolvedValue(createSuccessResult('No meshes found.'));

        const result = await verifyMeshDeployment(project, mockCommandManager);

        expect(result).toEqual({ success: false, error: 'No mesh ID found in project metadata' });
        expect(project.componentInstances?.['commerce-mesh'].metadata?.meshId).toBeUndefined();
    });

    it('reports the missing id when the describe output named only an endpoint', async () => {
        // An endpoint alone is not enough — the id is what the rest of the flow
        // addresses the mesh by.
        const project = projectWithMesh();
        mockCommandManager.execute.mockResolvedValue(
            createSuccessResult('Endpoint: https://mesh.example/graphql'),
        );

        const result = await verifyMeshDeployment(project, mockCommandManager);

        expect(result.success).toBe(false);
    });
});

describe('the verify call itself', () => {
    it('runs api-mesh:describe with the mesh Node version and the enhanced PATH', async () => {
        const project = projectWithMesh({ meshId: 'mesh123' });
        mockCommandManager.execute.mockResolvedValue(createSuccessResult('Mesh ID: mesh123'));

        await verifyMeshDeployment(project, mockCommandManager);

        expect(mockCommandManager.execute).toHaveBeenCalledWith('aio api-mesh:describe', {
            timeout: TIMEOUTS.NORMAL,
            configureTelemetry: false,
            useNodeVersion: expect.any(String),
            enhancePath: true,
        });
    });

    it('detects a mismatch when the listing spells the id "Mesh ID"', async () => {
        // A different id in the output means the workspace is pointed at another
        // mesh — reporting success would leave the project addressing one that
        // is not there.
        const project = projectWithMesh({ meshId: 'abc123' });
        mockCommandManager.execute.mockResolvedValue(createSuccessResult('Mesh ID: def456'));

        const result = await verifyMeshDeployment(project, mockCommandManager);

        expect(result.success).toBe(false);
        expect(result.error).toContain('def456');
    });

    it('detects the same mismatch when the listing spells it "mesh_id"', async () => {
        const project = projectWithMesh({ meshId: 'abc123' });
        mockCommandManager.execute.mockResolvedValue(createSuccessResult('mesh_id: def456'));

        const result = await verifyMeshDeployment(project, mockCommandManager);

        expect(result.success).toBe(false);
    });

    it('detects it when the listing runs the words together as "meshid"', async () => {
        const project = projectWithMesh({ meshId: 'abc123' });
        mockCommandManager.execute.mockResolvedValue(createSuccessResult('meshid: def456'));

        const result = await verifyMeshDeployment(project, mockCommandManager);

        expect(result.success).toBe(false);
    });

    it('accepts output that names no id, keeping the id the project holds', async () => {
        // The CLI does not always print the id. Treating "not found in the text"
        // as a mismatch would report a healthy mesh as broken.
        const project = projectWithMesh({ meshId: 'mesh123' });
        mockCommandManager.execute.mockResolvedValue(
            createSuccessResult('Endpoint: https://mesh.example/graphql'),
        );

        const result = await verifyMeshDeployment(project, mockCommandManager);

        expect(result.success).toBe(true);
        expect(result.data?.meshId).toBe('mesh123');
    });
});

describe('what counts as evidence of a past deployment', () => {
    it('promotes the component when the record says deployed', async () => {
        const project = projectWithRecord({ status: 'deployed' });

        await syncMeshStatus(project, { success: true, data: { exists: true } });

        expect(project.componentInstances?.['commerce-mesh'].status).toBe('deployed');
    });

    it('promotes it on a lastDeployed timestamp alone', async () => {
        // A legacy-synthesised record carries no endpoint but does carry this.
        const project = projectWithRecord({ lastDeployed: '2026-01-01T00:00:00.000Z' });

        await syncMeshStatus(project, { success: true, data: { exists: true } });

        expect(project.componentInstances?.['commerce-mesh'].status).toBe('deployed');
    });

    it('promotes it on a source hash alone', async () => {
        const project = projectWithRecord({ sourceHash: 'abc123' });

        await syncMeshStatus(project, { success: true, data: { exists: true } });

        expect(project.componentInstances?.['commerce-mesh'].status).toBe('deployed');
    });

    it('promotes it on recorded env vars alone', async () => {
        const project = projectWithRecord({ envVars: { MESH_ENDPOINT: 'https://x' } });

        await syncMeshStatus(project, { success: true, data: { exists: true } });

        expect(project.componentInstances?.['commerce-mesh'].status).toBe('deployed');
    });

    it('does NOT promote it from a cleared shell with none of the four', async () => {
        // This is the shell sync-gone leaves behind. Entry existence alone must
        // not read as a deployment record.
        const project = projectWithRecord({});

        await syncMeshStatus(project, { success: true, data: { exists: true } });

        expect(project.componentInstances?.['commerce-mesh'].status).toBe('ready');
    });

    it('does not throw when the project has no keyed mesh record at all', async () => {
        const project = projectWithMesh({ meshId: 'mesh123' });

        await syncMeshStatus(project, { success: true, data: { exists: true } });

        expect(project.componentInstances?.['commerce-mesh'].status).toBe('ready');
    });
});

describe('what syncMeshStatus refuses to act on', () => {
    it('changes nothing when the verification failed, even if it carried data', async () => {
        // A failed verification's data says nothing about the remote mesh.
        const project = projectWithRecord({ status: 'deployed' });

        await syncMeshStatus(project, {
            success: false,
            error: 'aio exploded',
            data: { exists: true },
        });

        expect(project.componentInstances?.['commerce-mesh'].status).toBe('ready');
    });

    it('changes nothing when the result carried no data', async () => {
        const project = projectWithRecord({ status: 'deployed' });

        await syncMeshStatus(project, { success: true });

        expect(project.componentInstances?.['commerce-mesh'].status).toBe('ready');
    });
});

describe('clearing the record when the remote mesh is gone', () => {
    it('leaves every non-mesh keyed sibling untouched', async () => {
        // The loop walks ALL keyed components and is scoped by kind; without the
        // scope, a mesh teardown clears every App Builder app in the project.
        const project = createMockProject({
            componentInstances: {
                'commerce-mesh': {
                    id: 'commerce-mesh',
                    name: 'API Mesh',
                    subType: 'mesh' as const,
                    path: '/test/mesh',
                    status: 'deployed' as const,
                    metadata: { meshId: 'mesh123' },
                },
            },
            appBuilderComponents: {
                mesh: {
                    kind: 'mesh',
                    status: 'deployed',
                    source: MESH_SOURCE,
                    endpoint: 'https://mesh/graphql',
                    lastDeployed: '2026-01-01T00:00:00.000Z',
                },
                'store-discovery': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'adobe', repo: 'store-discovery' },
                    endpoint: 'https://app/api',
                    envVars: { KEY: 'v' },
                    lastDeployed: '2026-01-02T00:00:00.000Z',
                    sourceHash: 'def456',
                },
            },
        });

        await syncMeshStatus(project, { success: true, data: { exists: false } });

        expect(project.appBuilderComponents?.['store-discovery']).toMatchObject({
            status: 'deployed',
            endpoint: 'https://app/api',
            envVars: { KEY: 'v' },
            lastDeployed: '2026-01-02T00:00:00.000Z',
            sourceHash: 'def456',
        });
        expect(project.appBuilderComponents?.mesh.status).toBe('not-deployed');
    });
});
