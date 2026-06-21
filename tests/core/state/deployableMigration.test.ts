/**
 * Tests for migrateLegacyToDeployables (Step 02)
 *
 * One-time READ-side migration of the singular `meshState`/`appState` into the
 * keyed `deployables` map. On-disk manifests are untouched in D1, so the
 * migration runs on every load and MUST be idempotent and defensive against
 * malformed/partial legacy state (no silent data loss).
 */

import { migrateLegacyToDeployables } from '@/core/state/deployableMigration';
import type { ProjectManifest } from '@/core/state/projectFileLoader';

describe('migrateLegacyToDeployables', () => {
    it('migrates a meshState-only manifest to one kind:mesh entry', () => {
        const manifest: ProjectManifest = {
            meshState: {
                envVars: {},
                sourceHash: 'abc123',
                lastDeployed: '2026-06-20T00:00:00.000Z',
                endpoint: 'https://mesh/graphql',
            },
        };

        const deployables = migrateLegacyToDeployables(manifest);

        expect(Object.keys(deployables)).toEqual(['mesh']);
        expect(deployables.mesh.kind).toBe('mesh');
        expect(deployables.mesh.status).toBe('deployed');
        expect(deployables.mesh.endpoint).toBe('https://mesh/graphql');
        expect(deployables.mesh.sourceHash).toBe('abc123');
        expect(deployables.mesh.lastDeployed).toBe('2026-06-20T00:00:00.000Z');
    });

    it('migrates an appState-only manifest to one kind:integration entry', () => {
        const manifest: ProjectManifest = {
            appState: {
                appId: 'erp',
                url: 'https://erp/api',
                status: 'deployed',
                deployedUrls: { ping: 'https://erp/ping' },
                lastDeployed: '2026-06-20T00:00:00.000Z',
                sourceHash: 'def456',
            },
        };

        const deployables = migrateLegacyToDeployables(manifest);

        expect(Object.keys(deployables)).toEqual(['erp']);
        expect(deployables.erp.kind).toBe('integration');
        expect(deployables.erp.url).toBe('https://erp/api');
        expect(deployables.erp.deployedUrls).toEqual({ ping: 'https://erp/ping' });
        expect(deployables.erp.sourceHash).toBe('def456');
    });

    it('migrates BOTH meshState and appState to two distinct entries with no collision', () => {
        const manifest: ProjectManifest = {
            meshState: {
                envVars: {},
                sourceHash: 'mesh-hash',
                lastDeployed: '2026-06-20T00:00:00.000Z',
                endpoint: 'https://mesh/graphql',
            },
            appState: {
                appId: 'erp',
                url: 'https://erp/api',
                status: 'deployed',
            },
        };

        const deployables = migrateLegacyToDeployables(manifest);
        const ids = Object.keys(deployables);

        expect(ids).toHaveLength(2);
        expect(new Set(ids).size).toBe(2);
        expect(ids).toContain('mesh');
        expect(ids).toContain('erp');
    });

    it('returns an empty object when neither meshState nor appState exist', () => {
        expect(migrateLegacyToDeployables({})).toEqual({});
    });

    it('returns a forward-state manifest unchanged (idempotent — no double migration)', () => {
        const manifest: ProjectManifest = {
            deployables: {
                mesh: {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: 'skukla', repo: 'commerce-paas-mesh' },
                    endpoint: 'https://already/graphql',
                },
            },
            // Legacy still present on disk in D1 — must NOT re-migrate over the keyed map.
            meshState: {
                envVars: {},
                sourceHash: 'legacy',
                lastDeployed: '2026-01-01T00:00:00.000Z',
                endpoint: 'https://legacy/graphql',
            },
        };

        const deployables = migrateLegacyToDeployables(manifest);

        expect(deployables).toEqual(manifest.deployables);
        expect(deployables.mesh.endpoint).toBe('https://already/graphql');
    });

    it('defensively migrates malformed meshState (no endpoint/lastDeployed) without throwing or dropping', () => {
        const manifest = {
            meshState: { envVars: {}, sourceHash: null } as ProjectManifest['meshState'],
        } as ProjectManifest;

        const deployables = migrateLegacyToDeployables(manifest);

        expect(Object.keys(deployables)).toEqual(['mesh']);
        expect(deployables.mesh.kind).toBe('mesh');
        expect(deployables.mesh.status).toBe('not-deployed');
        expect(deployables.mesh.endpoint).toBeUndefined();
    });

    it('defensively migrates malformed appState (missing status) to not-deployed', () => {
        const manifest = {
            appState: { appId: 'erp' } as unknown as ProjectManifest['appState'],
        } as ProjectManifest;

        const deployables = migrateLegacyToDeployables(manifest);

        expect(deployables.erp.kind).toBe('integration');
        expect(deployables.erp.status).toBe('not-deployed');
    });

    it('keys a legacy app with no appId under a stable fallback id', () => {
        const manifest: ProjectManifest = {
            appState: { url: 'https://app/api', status: 'deployed' },
        };

        const deployables = migrateLegacyToDeployables(manifest);

        expect(Object.keys(deployables)).toHaveLength(1);
        expect(Object.values(deployables)[0].kind).toBe('integration');
    });
});
