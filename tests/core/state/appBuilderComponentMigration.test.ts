/**
 * Tests for migrateLegacyToAppBuilderComponents (Step 02)
 *
 * One-time READ-side migration of the singular `meshState`/`appState` into the
 * keyed `appBuilderComponents` map. On-disk manifests are untouched in D1, so the
 * migration runs on every load and MUST be idempotent and defensive against
 * malformed/partial legacy state (no silent data loss).
 */

import { migrateLegacyToAppBuilderComponents } from '@/core/state/appBuilderComponentMigration';
import type { ProjectManifest } from '@/core/state/projectFileLoader';

describe('migrateLegacyToAppBuilderComponents', () => {
    it('migrates a meshState-only manifest to one kind:mesh entry', () => {
        const manifest: ProjectManifest = {
            meshState: {
                envVars: {},
                sourceHash: 'abc123',
                lastDeployed: '2026-06-20T00:00:00.000Z',
                endpoint: 'https://mesh/graphql',
            },
        };

        const appBuilderComponents = migrateLegacyToAppBuilderComponents(manifest);

        expect(Object.keys(appBuilderComponents)).toEqual(['mesh']);
        expect(appBuilderComponents.mesh.kind).toBe('mesh');
        expect(appBuilderComponents.mesh.status).toBe('deployed');
        // Legacy state never recorded where the mesh came from: an EMPTY
        // source, not an absent one, so readers see a known "unknown".
        expect(appBuilderComponents.mesh.source).toEqual({ owner: '', repo: '' });
        expect(appBuilderComponents.mesh.endpoint).toBe('https://mesh/graphql');
        expect(appBuilderComponents.mesh.sourceHash).toBe('abc123');
        expect(appBuilderComponents.mesh.lastDeployed).toBe('2026-06-20T00:00:00.000Z');
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

        const appBuilderComponents = migrateLegacyToAppBuilderComponents(manifest);

        expect(Object.keys(appBuilderComponents)).toEqual(['erp']);
        expect(appBuilderComponents.erp.kind).toBe('integration');
        expect(appBuilderComponents.erp.source).toEqual({ owner: '', repo: '' });
        expect(appBuilderComponents.erp.url).toBe('https://erp/api');
        expect(appBuilderComponents.erp.deployedUrls).toEqual({ ping: 'https://erp/ping' });
        expect(appBuilderComponents.erp.sourceHash).toBe('def456');
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

        const appBuilderComponents = migrateLegacyToAppBuilderComponents(manifest);
        const ids = Object.keys(appBuilderComponents);

        expect(ids).toHaveLength(2);
        expect(new Set(ids).size).toBe(2);
        expect(ids).toContain('mesh');
        expect(ids).toContain('erp');
    });

    it('returns an empty object when neither meshState nor appState exist', () => {
        expect(migrateLegacyToAppBuilderComponents({})).toEqual({});
    });

    it('returns a forward-state manifest unchanged (idempotent — no double migration)', () => {
        const manifest: ProjectManifest = {
            appBuilderComponents: {
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

        const appBuilderComponents = migrateLegacyToAppBuilderComponents(manifest);

        expect(appBuilderComponents).toEqual(manifest.appBuilderComponents);
        expect(appBuilderComponents.mesh.endpoint).toBe('https://already/graphql');
    });

    it('defensively migrates malformed meshState (no endpoint/lastDeployed) without throwing or dropping', () => {
        const manifest = {
            meshState: { envVars: {}, sourceHash: null } as ProjectManifest['meshState'],
        } as ProjectManifest;

        const appBuilderComponents = migrateLegacyToAppBuilderComponents(manifest);

        expect(Object.keys(appBuilderComponents)).toEqual(['mesh']);
        expect(appBuilderComponents.mesh.kind).toBe('mesh');
        expect(appBuilderComponents.mesh.status).toBe('not-deployed');
        expect(appBuilderComponents.mesh.endpoint).toBeUndefined();
    });

    it('defensively migrates malformed appState (missing status) to not-deployed', () => {
        const manifest = {
            appState: { appId: 'erp' } as unknown as ProjectManifest['appState'],
        } as ProjectManifest;

        const appBuilderComponents = migrateLegacyToAppBuilderComponents(manifest);

        expect(appBuilderComponents.erp.kind).toBe('integration');
        expect(appBuilderComponents.erp.status).toBe('not-deployed');
    });

    it('keys a legacy app with no appId under a stable fallback id', () => {
        const manifest: ProjectManifest = {
            appState: { url: 'https://app/api', status: 'deployed' },
        };

        const appBuilderComponents = migrateLegacyToAppBuilderComponents(manifest);

        // 'app' is the id every load of this manifest will produce — a stable
        // key, so nothing keyed on it (state, picks) moves between loads.
        expect(Object.keys(appBuilderComponents)).toEqual(['app']);
        expect(appBuilderComponents.app.kind).toBe('integration');
    });

    // ADR-011 D3 Steps 07+09: once Step 07 stops persisting meshState, the
    // migrated keyed entry is the ONLY carrier of the mesh runtime baseline.
    // The migration must therefore carry envVars + the decline flags, or a
    // legacy project's first save would silently drop its staleness baseline.
    describe('mesh runtime-field carriage (D3 Steps 07+09)', () => {
        it('carries envVars onto the migrated mesh entry', () => {
            const manifest: ProjectManifest = {
                meshState: {
                    envVars: { ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://commerce/graphql' },
                    sourceHash: 'abc123',
                    lastDeployed: '2026-06-20T00:00:00.000Z',
                    endpoint: 'https://mesh/graphql',
                },
            };

            const appBuilderComponents = migrateLegacyToAppBuilderComponents(manifest);

            expect(appBuilderComponents.mesh.envVars).toEqual({
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://commerce/graphql',
            });
        });

        it('defaults envVars to an empty object when the legacy state lacks them', () => {
            const manifest = {
                meshState: {
                    sourceHash: 'abc123',
                    lastDeployed: '2026-06-20T00:00:00.000Z',
                    endpoint: 'https://mesh/graphql',
                } as ProjectManifest['meshState'],
            } as ProjectManifest;

            const appBuilderComponents = migrateLegacyToAppBuilderComponents(manifest);

            expect(appBuilderComponents.mesh.envVars).toEqual({});
        });

        it('carries the "Later" decline flags onto the migrated mesh entry', () => {
            const manifest: ProjectManifest = {
                meshState: {
                    envVars: {},
                    sourceHash: 'abc123',
                    lastDeployed: '2026-06-20T00:00:00.000Z',
                    endpoint: 'https://mesh/graphql',
                    userDeclinedUpdate: true,
                    declinedAt: '2026-07-14T00:00:00.000Z',
                },
            };

            const appBuilderComponents = migrateLegacyToAppBuilderComponents(manifest);

            expect(appBuilderComponents.mesh.userDeclinedUpdate).toBe(true);
            expect(appBuilderComponents.mesh.declinedAt).toBe('2026-07-14T00:00:00.000Z');
        });
    });

    // ADR-011 D3 Step 09: malformed/partial legacy state degrades safely — no
    // throw, no fabricated garbage entries, and the GOOD entries survive. This
    // is the last guard now that the singular write-side is gone (Step 07): a
    // corrupt legacy field must never poison the keyed map a first save persists.
    describe('malformed legacy state degradation (D3 Step 09)', () => {
        it('skips a non-object meshState while migrating the valid appState (good entry survives)', () => {
            const manifest = {
                meshState: 'corrupt' as unknown as ProjectManifest['meshState'],
                appState: {
                    appId: 'erp',
                    url: 'https://erp/api',
                    status: 'deployed',
                },
            } as ProjectManifest;

            const appBuilderComponents = migrateLegacyToAppBuilderComponents(manifest);

            expect(Object.keys(appBuilderComponents)).toEqual(['erp']);
            expect(appBuilderComponents.erp.url).toBe('https://erp/api');
        });

        it('skips a non-object appState while migrating the valid meshState (good entry survives)', () => {
            const manifest = {
                meshState: {
                    envVars: {},
                    sourceHash: 'abc123',
                    lastDeployed: '2026-06-20T00:00:00.000Z',
                    endpoint: 'https://mesh/graphql',
                },
                appState: 42 as unknown as ProjectManifest['appState'],
            } as ProjectManifest;

            const appBuilderComponents = migrateLegacyToAppBuilderComponents(manifest);

            expect(Object.keys(appBuilderComponents)).toEqual(['mesh']);
            expect(appBuilderComponents.mesh.endpoint).toBe('https://mesh/graphql');
        });

        it('skips a JSON null in either legacy field — the shape a hand-edited manifest carries', () => {
            // Parsed, not typed: `null` is what an SC clearing a field by hand
            // leaves behind, and the types say it cannot happen.
            const manifest: ProjectManifest = JSON.parse('{"meshState": null, "appState": null}');

            expect(migrateLegacyToAppBuilderComponents(manifest)).toEqual({});
        });

        it('returns an empty map without throwing when BOTH legacy fields are malformed', () => {
            const manifest = {
                meshState: [] as unknown as ProjectManifest['meshState'],
                appState: 'nope' as unknown as ProjectManifest['appState'],
            } as ProjectManifest;

            expect(() => migrateLegacyToAppBuilderComponents(manifest)).not.toThrow();
            expect(migrateLegacyToAppBuilderComponents(manifest)).toEqual({});
        });
    });
});
