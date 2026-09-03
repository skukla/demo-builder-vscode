/**
 * ProjectFileLoader integration tests
 *
 * Verifies the keyed `appBuilderComponents` handling through the REAL loader:
 * a persisted map is preferred verbatim (ADR-011 D3 Step 01), the read-side
 * migration of legacy `meshState`/`appState` remains the fallback for old
 * manifests, and loading a project does NOT mutate the on-disk manifest.
 */

import * as fs from 'fs/promises';
import { ProjectConfigWriter } from '@/core/state/projectConfigWriter';
import { resolveDesiredApis } from '@/core/state/componentApiPicks';
import { ProjectFileLoader } from '@/core/state/projectFileLoader';
import { getMeshAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import { extractSettingsFromProject } from '@/features/projects-dashboard/services/settingsSerializer';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../helpers/loggerFake';
import { createMockProject } from '../../helpers/projectFake';

jest.mock('fs/promises');

const mockedFs = fs as jest.Mocked<typeof fs>;

function makeLogger(): Logger {
    return createMockLogger() as unknown as Logger;
}

const PROJECT_PATH = '/tmp/legacy-demo';

function primeFsWithManifest(manifest: Record<string, unknown>): void {
    // access() resolves (path + manifest exist); components dir read fails (none).
    mockedFs.access.mockResolvedValue(undefined);
    mockedFs.readFile.mockResolvedValue(JSON.stringify(manifest));
    mockedFs.readdir.mockRejectedValue(new Error('no components dir'));
    mockedFs.writeFile.mockResolvedValue(undefined);
}

describe('ProjectFileLoader — legacy appBuilderComponent migration', () => {
    it('loads a manifest with legacy meshState into a migrated mesh appBuilderComponent', async () => {
        primeFsWithManifest({
            name: 'legacy-demo',
            meshState: {
                envVars: {},
                sourceHash: 'abc123',
                lastDeployed: '2026-06-20T00:00:00.000Z',
                endpoint: 'https://mesh/graphql',
            },
        });

        const loader = new ProjectFileLoader(makeLogger());
        const project = await loader.loadProject(PROJECT_PATH, () => []);

        expect(project).not.toBeNull();
        const mesh = getMeshAppBuilderComponent(project!);
        expect(mesh).toBeDefined();
        expect(mesh?.kind).toBe('mesh');
        expect(mesh?.endpoint).toBe('https://mesh/graphql');
        // Came from the keyed appBuilderComponents map (the migration ran), not just read-through.
        expect(project!.appBuilderComponents?.mesh?.endpoint).toBe('https://mesh/graphql');
    });

    it('loads aiContextVersion from the manifest into the project', async () => {
        primeFsWithManifest({ name: 'stamped-demo', aiContextVersion: 2 });

        const loader = new ProjectFileLoader(makeLogger());
        const project = await loader.loadProject(PROJECT_PATH, () => []);

        expect(project).not.toBeNull();
        expect(project!.aiContextVersion).toBe(2);
    });

    it('leaves aiContextVersion undefined when the manifest omits it', async () => {
        primeFsWithManifest({ name: 'unstamped-demo' });

        const loader = new ProjectFileLoader(makeLogger());
        const project = await loader.loadProject(PROJECT_PATH, () => []);

        expect(project).not.toBeNull();
        expect(project!.aiContextVersion).toBeUndefined();
    });

    // ADR-013: the per-file hash map rides the manifest next to aiContextVersion.
    it('loads aiFileHashes from the manifest into the project', async () => {
        primeFsWithManifest({
            name: 'hashed-demo',
            aiFileHashes: { 'AGENTS.md': 'abc123', '.claude/skills/add-component.md': 'def456' },
        });

        const loader = new ProjectFileLoader(makeLogger());
        const project = await loader.loadProject(PROJECT_PATH, () => []);

        expect(project).not.toBeNull();
        expect(project!.aiFileHashes).toEqual({
            'AGENTS.md': 'abc123',
            '.claude/skills/add-component.md': 'def456',
        });
    });

    it('leaves aiFileHashes undefined when the manifest omits it (pre-ADR project)', async () => {
        primeFsWithManifest({ name: 'unhashed-demo' });

        const loader = new ProjectFileLoader(makeLogger());
        const project = await loader.loadProject(PROJECT_PATH, () => []);

        expect(project).not.toBeNull();
        expect(project!.aiFileHashes).toBeUndefined();
    });

    it('loads publishKeyRegisteredAt from the manifest into the project', async () => {
        primeFsWithManifest({
            name: 'keyed-demo',
            publishKeyRegisteredAt: '2026-08-15T12:00:00.000Z',
        });

        const loader = new ProjectFileLoader(makeLogger());
        const project = await loader.loadProject(PROJECT_PATH, () => []);

        expect(project).not.toBeNull();
        expect(project!.publishKeyRegisteredAt).toBe('2026-08-15T12:00:00.000Z');
    });

    it('leaves publishKeyRegisteredAt undefined for a storefront created before the sweep', async () => {
        // The renewal sweep reads absence as "due", which is how every existing
        // storefront gets its first key refresh after upgrading.
        primeFsWithManifest({ name: 'pre-sweep-demo' });

        const loader = new ProjectFileLoader(makeLogger());
        const project = await loader.loadProject(PROJECT_PATH, () => []);

        expect(project).not.toBeNull();
        expect(project!.publishKeyRegisteredAt).toBeUndefined();
    });

    it('does not write the manifest file during load (read-only migration in D1)', async () => {
        primeFsWithManifest({
            name: 'legacy-demo',
            meshState: {
                envVars: {},
                sourceHash: 'abc123',
                lastDeployed: '2026-06-20T00:00:00.000Z',
                endpoint: 'https://mesh/graphql',
            },
        });

        const loader = new ProjectFileLoader(makeLogger());
        await loader.loadProject(PROJECT_PATH, () => []);

        expect(mockedFs.writeFile).not.toHaveBeenCalled();
    });
});

// ADR-011 D3 Step 01: the keyed map is now persisted in the manifest. The
// loader must PREFER the persisted map (no re-migration from the legacy
// singletons) and fall back to the migration only for old manifests that
// carry no keyed map.
describe('ProjectFileLoader — persisted appBuilderComponents (ADR-011 D3 Step 01)', () => {
    const persistedMap = {
        'commerce-eds-mesh': {
            kind: 'mesh' as const,
            status: 'deployed' as const,
            source: { owner: 'skukla', repo: 'commerce-eds-mesh', branch: 'main' },
            endpoint: 'https://persisted-mesh/graphql',
            lastDeployed: '2026-07-15T00:00:00.000Z',
            // Mesh-kind runtime fields (ADR-011 D3 Step 06): the deployed-env
            // baseline + decline flow must survive the writer→loader round-trip
            // so Step 07 can retire the singular meshState.
            envVars: { ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://commerce/graphql' },
            sourceHash: 'persisted-hash',
            userDeclinedUpdate: true,
            declinedAt: '2026-07-14T00:00:00.000Z',
        },
        'acme-widget': {
            kind: 'integration' as const,
            status: 'deployed' as const,
            name: 'ACME Widget',
            source: { owner: 'acme', repo: 'widget' },
            url: 'https://acme.adobeio-static.net',
            lastDeployed: '2026-07-15T00:00:00.000Z',
        },
    };

    it('prefers the persisted keyed map over re-migration from legacy state', async () => {
        // Manifest carries BOTH a keyed map and a conflicting legacy meshState:
        // the persisted map must win verbatim (no 'mesh' key fabricated from legacy).
        primeFsWithManifest({
            name: 'forward-demo',
            appBuilderComponents: persistedMap,
            meshState: {
                envVars: {},
                sourceHash: 'stale',
                lastDeployed: '2026-01-01T00:00:00.000Z',
                endpoint: 'https://legacy-mesh/graphql',
            },
        });

        const loader = new ProjectFileLoader(makeLogger());
        const project = await loader.loadProject(PROJECT_PATH, () => []);

        expect(project!.appBuilderComponents).toEqual(persistedMap);
        expect(project!.appBuilderComponents?.mesh).toBeUndefined();
    });

    it('loads the persisted integration display name', async () => {
        primeFsWithManifest({ name: 'named-demo', appBuilderComponents: persistedMap });

        const loader = new ProjectFileLoader(makeLogger());
        const project = await loader.loadProject(PROJECT_PATH, () => []);

        const widget = project!.appBuilderComponents?.['acme-widget'] as { name?: string };
        expect(widget?.name).toBe('ACME Widget');
    });

    it('falls back to the legacy migration when the manifest has no keyed map', async () => {
        primeFsWithManifest({
            name: 'legacy-demo',
            meshState: {
                envVars: {},
                sourceHash: 'abc123',
                lastDeployed: '2026-06-20T00:00:00.000Z',
                endpoint: 'https://legacy-mesh/graphql',
            },
            appState: {
                appId: 'acme-widget',
                url: 'https://acme.adobeio-static.net',
                status: 'deployed',
            },
        });

        const loader = new ProjectFileLoader(makeLogger());
        const project = await loader.loadProject(PROJECT_PATH, () => []);

        expect(project!.appBuilderComponents?.mesh?.endpoint).toBe('https://legacy-mesh/graphql');
        expect(project!.appBuilderComponents?.['acme-widget']?.url).toBe(
            'https://acme.adobeio-static.net'
        );
    });

    it('round-trips the keyed map through the real writer and loader (deep-equal)', async () => {
        // Write with the REAL ProjectConfigWriter, capture the manifest JSON,
        // then load it back with the REAL ProjectFileLoader.
        mockedFs.access.mockResolvedValue(undefined);
        mockedFs.mkdir.mockResolvedValue(undefined);
        mockedFs.writeFile.mockResolvedValue(undefined);
        mockedFs.rename.mockResolvedValue(undefined);
        mockedFs.unlink.mockResolvedValue(undefined);

        const project = createMockProject({
            name: 'round-trip',
            path: PROJECT_PATH,
            created: new Date('2026-07-15T00:00:00Z'),
            componentSelections: {},
            componentInstances: {},
            componentConfigs: {},
            componentVersions: {},
            appBuilderComponents: persistedMap,
        });

        const writer = new ProjectConfigWriter(makeLogger());
        await writer.saveProjectConfig(project, PROJECT_PATH);

        const manifestWrite = mockedFs.writeFile.mock.calls.find((call) =>
            call[0].toString().endsWith('.tmp')
        );
        expect(manifestWrite).toBeDefined();

        mockedFs.readFile.mockResolvedValue(manifestWrite![1] as string);
        mockedFs.readdir.mockRejectedValue(new Error('no components dir'));

        const loader = new ProjectFileLoader(makeLogger());
        const reloaded = await loader.loadProject(PROJECT_PATH, () => []);

        expect(reloaded!.appBuilderComponents).toEqual(persistedMap);
    });

    // ADR-011 D3 Steps 07+09: forward migration on first save. A legacy on-disk
    // project (only meshState/appState) loads via the migration fallback, and its
    // FIRST save persists the keyed map — including the mesh runtime baseline
    // (envVars), which after Step 07 has no other durable home.
    it('persists the migrated keyed map (with the mesh baseline) on first save of a legacy project', async () => {
        primeFsWithManifest({
            name: 'legacy-demo',
            meshState: {
                envVars: { ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://commerce/graphql' },
                sourceHash: 'abc123',
                lastDeployed: '2026-06-20T00:00:00.000Z',
                endpoint: 'https://legacy-mesh/graphql',
            },
            appState: {
                appId: 'acme-widget',
                url: 'https://acme.adobeio-static.net',
                status: 'deployed',
            },
        });
        mockedFs.mkdir.mockResolvedValue(undefined);
        mockedFs.rename.mockResolvedValue(undefined);
        mockedFs.unlink.mockResolvedValue(undefined);

        const loader = new ProjectFileLoader(makeLogger());
        const project = await loader.loadProject(PROJECT_PATH, () => []);

        mockedFs.writeFile.mockClear();
        const writer = new ProjectConfigWriter(makeLogger());
        await writer.saveProjectConfig(project!, PROJECT_PATH);

        const manifestWrite = mockedFs.writeFile.mock.calls.find((call) =>
            call[0].toString().endsWith('.tmp')
        );
        expect(manifestWrite).toBeDefined();
        const written = JSON.parse(manifestWrite![1] as string);

        expect(written.appBuilderComponents?.mesh?.endpoint).toBe('https://legacy-mesh/graphql');
        expect(written.appBuilderComponents?.mesh?.envVars).toEqual({
            ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://commerce/graphql',
        });
        expect(written.appBuilderComponents?.['acme-widget']?.url).toBe(
            'https://acme.adobeio-static.net'
        );

        // ADR-011 D3 Step 07: the singular write-side is retired — the rewritten
        // manifest carries the keyed map ONLY (one-time forward migration).
        expect(written.meshState).toBeUndefined();
        expect(written.appState).toBeUndefined();

        // Round-trip: reloading the forward-migrated manifest yields the
        // identical keyed map (nothing was lost by dropping the singulars).
        mockedFs.readFile.mockResolvedValue(manifestWrite![1] as string);
        mockedFs.readdir.mockRejectedValue(new Error('no components dir'));
        const reloaded = await loader.loadProject(PROJECT_PATH, () => []);
        expect(reloaded!.appBuilderComponents).toEqual(written.appBuilderComponents);
    });
});

// §E (shell instancing Step 8): `additionalConsoleApis` must persist through the
// manifest — it is NOT derivable (user free picks beyond requiredApis), and the
// dashboard's full-union subscription PUT reads it. Before this, a post-reload
// redeploy silently dropped the user's picked APIs.
describe('additionalConsoleApis — manifest persistence (§E)', () => {
    function baseProject(overrides: Record<string, unknown> = {}): Project {
        return {
            name: 'apis-demo',
            path: PROJECT_PATH,
            created: new Date('2026-07-15T00:00:00Z'),
            componentSelections: {},
            componentInstances: {},
            componentConfigs: {},
            componentVersions: {},
            ...overrides,
        } as unknown as Project;
    }

    async function writeAndCaptureManifest(project: Project): Promise<Record<string, unknown>> {
        mockedFs.access.mockResolvedValue(undefined);
        mockedFs.mkdir.mockResolvedValue(undefined);
        mockedFs.writeFile.mockResolvedValue(undefined);
        mockedFs.rename.mockResolvedValue(undefined);
        mockedFs.unlink.mockResolvedValue(undefined);
        mockedFs.writeFile.mockClear();

        const writer = new ProjectConfigWriter(makeLogger());
        await writer.saveProjectConfig(project, PROJECT_PATH);

        const manifestWrite = mockedFs.writeFile.mock.calls.find((call) =>
            call[0].toString().endsWith('.tmp')
        );
        expect(manifestWrite).toBeDefined();
        return JSON.parse(manifestWrite![1] as string) as Record<string, unknown>;
    }

    it('does NOT persist the flat field — step 07 retired the flat write', async () => {
        // A legacy in-memory value (loaded from an old manifest) is not
        // re-persisted; the keyed map is the one written form.
        const written = await writeAndCaptureManifest(
            baseProject({ additionalConsoleApis: ['AssetComputeSDK', 'CCAPI'] })
        );

        expect('additionalConsoleApis' in written).toBe(false);
    });

    it('omits the field from the manifest for an empty picks list', async () => {
        const written = await writeAndCaptureManifest(baseProject({ additionalConsoleApis: [] }));

        expect('additionalConsoleApis' in written).toBe(false);
    });

    it('omits the field from the manifest when undefined', async () => {
        const written = await writeAndCaptureManifest(baseProject());

        expect('additionalConsoleApis' in written).toBe(false);
    });

    it('loads additionalConsoleApis from a manifest that carries it', async () => {
        primeFsWithManifest({
            name: 'apis-demo',
            additionalConsoleApis: ['AssetComputeSDK', 'CCAPI'],
        });

        const loader = new ProjectFileLoader(makeLogger());
        const project = await loader.loadProject(PROJECT_PATH, () => []);

        expect(project!.additionalConsoleApis).toEqual(['AssetComputeSDK', 'CCAPI']);
    });

    it('tolerates legacy manifests without the field (loads with undefined)', async () => {
        primeFsWithManifest({ name: 'legacy-demo' });

        const loader = new ProjectFileLoader(makeLogger());
        const project = await loader.loadProject(PROJECT_PATH, () => []);

        expect(project).not.toBeNull();
        expect(project!.additionalConsoleApis).toBeUndefined();
    });

    it('round-trips picks through the real writer and loader — via the keyed map', async () => {
        const written = await writeAndCaptureManifest(
            baseProject({ componentApiPicks: { 'erp-sync': ['CCAPI'] } })
        );

        mockedFs.readFile.mockResolvedValue(JSON.stringify(written));
        mockedFs.readdir.mockRejectedValue(new Error('no components dir'));

        const loader = new ProjectFileLoader(makeLogger());
        const reloaded = await loader.loadProject(PROJECT_PATH, () => []);

        expect(reloaded!.componentApiPicks).toEqual({ 'erp-sync': ['CCAPI'] });
    });

    // ---- per-integration attribution (step 01; flat write retired in step 07) ----
    // The keyed map is the one written form. Legacy manifests carrying only the
    // flat field still LOAD (migrateApiPicks folds them under __existing__).

    it('persists componentApiPicks as the ONLY written form', async () => {
        const written = await writeAndCaptureManifest(
            baseProject({
                componentApiPicks: { 'erp-sync': ['CCAPI'] },
                additionalConsoleApis: ['CCAPI'],
            })
        );

        expect(written.componentApiPicks).toEqual({ 'erp-sync': ['CCAPI'] });
        expect('additionalConsoleApis' in written).toBe(false);
    });

    it('omits componentApiPicks when empty (legacy manifests keep loading via migration)', async () => {
        const written = await writeAndCaptureManifest(baseProject({ componentApiPicks: {} }));

        expect('componentApiPicks' in written).toBe(false);
    });

    // REGRESSION GUARD: a pre-attribution manifest must load with its picks moved
    // under the unattributed key. If the migration ever dropped them the union
    // would come back EMPTY, and the next subscribe PUT — which sets extras to
    // exactly that list — would unsubscribe live APIs on a working project.
    it('MIGRATES a pre-attribution manifest onto the keyed map on load', async () => {
        primeFsWithManifest({
            name: 'legacy-apis-demo',
            additionalConsoleApis: ['AssetComputeSDK', 'CCAPI'],
        });

        const loader = new ProjectFileLoader(makeLogger());
        const project = await loader.loadProject(PROJECT_PATH, () => []);

        expect(project!.componentApiPicks).toEqual({
            __existing__: ['AssetComputeSDK', 'CCAPI'],
        });
        expect(resolveDesiredApis(project!).sort()).toEqual(['AssetComputeSDK', 'CCAPI']);
    });

    it('leaves an already-keyed manifest alone on load', async () => {
        primeFsWithManifest({
            name: 'keyed-demo',
            componentApiPicks: { 'erp-sync': ['CCAPI'] },
            additionalConsoleApis: ['STALE'],
        });

        const loader = new ProjectFileLoader(makeLogger());
        const project = await loader.loadProject(PROJECT_PATH, () => []);

        expect(project!.componentApiPicks).toEqual({ 'erp-sync': ['CCAPI'] });
        // Keyed wins — the stale flat field must not leak into the union.
        expect(resolveDesiredApis(project!)).toEqual(['CCAPI']);
    });
});

// §E end-to-end: a project holding keyed AI-built instances round-trips through
// the REAL writer + loader into edit settings — derived sources (with names) +
// persisted API picks both present after a reload.
describe('§E edit-mode round-trip — keyed instances → manifest → edit settings', () => {
    it('extractSettingsFromProject on a reloaded project yields sources + names + apis', async () => {
        const keyedMap = {
            'firefly-image-gen': {
                kind: 'integration' as const,
                status: 'deployed' as const,
                name: 'Firefly Image Gen',
                source: { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' },
                url: 'https://firefly.adobeio-static.net',
            },
            'commerce-eds-mesh': {
                kind: 'mesh' as const,
                status: 'deployed' as const,
                source: { owner: 'skukla', repo: 'commerce-eds-mesh', branch: 'main' },
                endpoint: 'https://mesh/graphql',
            },
        };

        mockedFs.access.mockResolvedValue(undefined);
        mockedFs.mkdir.mockResolvedValue(undefined);
        mockedFs.writeFile.mockResolvedValue(undefined);
        mockedFs.rename.mockResolvedValue(undefined);
        mockedFs.unlink.mockResolvedValue(undefined);
        mockedFs.writeFile.mockClear();

        const project = createMockProject({
            name: 'round-trip-e2e',
            path: PROJECT_PATH,
            created: new Date('2026-07-15T00:00:00Z'),
            componentSelections: { appBuilder: ['firefly-image-gen'] },
            componentInstances: {},
            componentConfigs: {},
            componentVersions: {},
            appBuilderComponents: keyedMap,
            // Keyed picks are what persist since step 07; the loader migrates
            // legacy flat-only manifests into this shape on load anyway.
            componentApiPicks: { __existing__: ['FireflySDK'] },
        });

        const writer = new ProjectConfigWriter(makeLogger());
        await writer.saveProjectConfig(project, PROJECT_PATH);

        const manifestWrite = mockedFs.writeFile.mock.calls.find((call) =>
            call[0].toString().endsWith('.tmp')
        );
        mockedFs.readFile.mockResolvedValue(manifestWrite![1] as string);
        mockedFs.readdir.mockRejectedValue(new Error('no components dir'));

        const loader = new ProjectFileLoader(makeLogger());
        const reloaded = await loader.loadProject(PROJECT_PATH, () => []);

        const settings = extractSettingsFromProject(reloaded!, false);

        expect(settings.appBuilderComponentSources).toEqual({
            'firefly-image-gen': {
                owner: 'skukla',
                repo: 'app-builder-shell',
                branch: 'main',
                name: 'Firefly Image Gen',
            },
        });
        expect(settings.additionalConsoleApis).toBeUndefined();
        expect(settings.componentApiPicks).toEqual({ __existing__: ['FireflySDK'] });
    });
});
