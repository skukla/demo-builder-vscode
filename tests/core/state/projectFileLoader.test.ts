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
import { ProjectFileLoader } from '@/core/state/projectFileLoader';
import { getMeshAppBuilderComponent } from '@/features/app-builder/services/appBuilderComponentState';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';

jest.mock('fs/promises');

const mockedFs = fs as jest.Mocked<typeof fs>;

function makeLogger(): Logger {
    return {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    } as unknown as Logger;
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

        const project = {
            name: 'round-trip',
            path: PROJECT_PATH,
            created: new Date('2026-07-15T00:00:00Z'),
            componentSelections: {},
            componentInstances: {},
            componentConfigs: {},
            componentVersions: {},
            appBuilderComponents: persistedMap,
        } as unknown as Project;

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
});
