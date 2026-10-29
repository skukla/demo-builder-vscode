/**
 * Every field on `Project` either survives a save and a load, or says why not.
 *
 * `getCurrentProject` reads the manifest from disk on every call, so a field the
 * handler sets and `saveProject` does not write is gone by the next call. Three
 * shipped that way: `commerceConfigChange` (so `set_commerce_config`'s `undo`
 * answered "no settings change to undo" after every write, from 2026-10-10),
 * `demoPackage` (so a Share save's proof of authorship was lost, and Remove left
 * the description file behind), and `frontendEnvState` (so "restart to apply"
 * never showed).
 *
 * The table below is typed over `keyof Required<Project>`, so a field added to
 * `Project` fails `typecheck:tests` here until someone decides which it is.
 *
 * Writer and loader are both REAL; only `fs/promises` is faked, the JSON the
 * writer hands to disk being exactly what the loader reads back.
 */

import type { Project } from '@/types/base';
import { ProjectFileLoader } from '@/core/state/projectFileLoader';
import {
    ProjectConfigWriter,
    createTestProject,
    mockFs,
    mockLogger,
    resetFsMocks,
    writtenManifest,
} from './projectConfigWriter.testUtils';

// Here as well as in the testUtils: this hoists above the loader's import, which
// would otherwise bind the real fs.
jest.mock('fs/promises');

type Decision<V> = { roundTrips: NonNullable<V> } | { notWritten: string } | { ownSuite: string };

const PROJECT_PATH = '/projects/acme';

const FIELDS: { [K in keyof Required<Project>]: Decision<Project[K]> } = {
    name: { ownSuite: 'required; falls back to the folder name (projectFileLoader.test.ts)' },
    title: { roundTrips: 'Acme Demo' },
    template: { notWritten: 'nothing in src/ sets it' },
    created: { ownSuite: 'a Date in memory, an ISO string on disk (projectConfigWriter-atomicWrite)' },
    lastModified: { notWritten: 'stamped with the time of each save' },
    path: { notWritten: 'the folder the manifest is read from' },
    status: { notWritten: 'detected from the running terminals on load' },
    organization: { notWritten: 'nothing in src/ sets it; the org lives on `adobe`' },
    adobe: { roundTrips: { organization: 'org1', projectId: 'p1', workspace: 'w1' } },
    commerce: { roundTrips: { type: 'platform-as-a-service', instance: { url: 'https://store.example', environmentId: 'e1', storeCode: 'main', storeView: 'default' } } as NonNullable<Project['commerce']> },
    componentInstances: { ownSuite: 'merged with the components on disk (projectFileLoader-discovery)' },
    componentSelections: { roundTrips: { backend: 'adobe-commerce-accs' } },
    componentConfigs: { ownSuite: 'an entry the selections no longer name is dropped (projectFileLoader-orphanConfigs)' },
    commerceStoreStructure: { ownSuite: 'projectConfigWriter-storeStructure' },
    selectedPackage: { roundTrips: 'citisignal' },
    demo: { roundTrips: { kind: 'demo', version: 1, name: 'Isle5', source: { owner: 'jen', repo: 'isle5' }, storefrontKind: 'eds' } },
    datapack: {
        roundTrips: {
            name: 'acme-demo-1a2b3c',
            version: '20261029-1000',
            store: 'library',
            origin: { name: 'bodea', version: '1.0.0', store: 'installer' },
        },
    },
    ownDatapack: { roundTrips: { name: 'acme-demo-1a2b3c', renamed: true } },
    selectedStack: { roundTrips: 'eds-accs' },
    selectedAddons: { roundTrips: ['adobe-commerce-aco'] },
    demoPackage: { roundTrips: { fileSha: 'abc123', savedAt: '2026-10-29T10:00:00.000Z' } },
    selectedBlockLibraries: { roundTrips: ['isle5'] },
    customBlockLibraries: { roundTrips: [{ name: 'Mine', source: { owner: 'me', repo: 'blocks', branch: 'main' } }] },
    installedBlockLibraries: { ownSuite: 'projectFileLoader.test.ts' },
    installedInspectorSdk: { notWritten: 'nothing in src/ sets it' },
    meshStatusSummary: { notWritten: 'recomputed from the keyed components on load' },
    appStatusSummary: { notWritten: 'recomputed from the keyed components on load' },
    edsStorefrontState: { roundTrips: { envVars: { A: '1' }, lastPublished: '2026-10-29T10:00:00.000Z' } },
    edsStorefrontStatusSummary: { roundTrips: 'published' },
    frontendEnvState: { roundTrips: { envVars: { A: '1' }, capturedAt: '2026-10-29T10:00:00.000Z' } },
    componentVersions: { ownSuite: 'merged with the components on disk (projectFileLoader-discovery)' },
    appBuilderComponents: { ownSuite: 'projectFileLoader.test.ts (keyed map round-trip)' },
    additionalConsoleApis: { notWritten: 'retired; componentApiPicks is the one written form' },
    componentApiPicks: { ownSuite: 'projectFileLoader.test.ts (picks round-trip)' },
    aiPrompts: { roundTrips: [{ id: 'p1', title: 'Hello', prompt: 'Say hello' }] },
    aiContextVersion: { roundTrips: 7 },
    aiFileHashes: { roundTrips: { 'AGENTS.md': 'deadbeef' } },
    publishKeyRegisteredAt: { roundTrips: '2026-08-15T12:00:00.000Z' },
    pinned: { roundTrips: true },
    commerceConfigChange: {
        roundTrips: {
            at: '2026-10-29T10:00:00.000Z',
            previous: [{ path: 'catalog/price/scope', scope: 'default', stored: '0', effective: '0', wrote: '1' }],
        },
    },
    createdAt: { notWritten: 'nothing in src/ sets it; `created` is the field' },
    updatedAt: { notWritten: 'nothing in src/ sets it; `lastModified` is the field' },
};

const ROUND_TRIPS = Object.entries(FIELDS).flatMap(([key, decision]) =>
    'roundTrips' in decision ? [[key, decision.roundTrips] as const] : [],
);

async function saveThenLoad(overrides: Partial<Project>): Promise<Project | null> {
    await new ProjectConfigWriter(mockLogger).saveProjectConfig(
        createTestProject({ path: PROJECT_PATH, ...overrides }),
        PROJECT_PATH,
    );
    mockFs.readFile.mockResolvedValue(JSON.stringify(writtenManifest()));
    mockFs.readdir.mockRejectedValue(new Error('no components dir'));
    return new ProjectFileLoader(mockLogger).loadProject(PROJECT_PATH, () => []);
}

describe('a Project field survives a save and a load', () => {
    beforeEach(() => resetFsMocks());

    it.each(ROUND_TRIPS)('%s', async (key, value) => {
        const overrides: Partial<Project> = Object.assign({}, { [key]: value });
        const reloaded = await saveThenLoad(overrides);

        expect(reloaded?.[key as keyof Project]).toEqual(value);
    });
});
