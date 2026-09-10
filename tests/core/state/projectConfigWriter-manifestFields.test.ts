/**
 * Which optional fields the manifest carries, and when it carries NOTHING.
 *
 * Present-but-empty is not absent: the loader's legacy migrations key off a
 * key being missing, so an empty list or map written where the writer should
 * have stayed silent defeats them. Each field is pinned from both sides —
 * written verbatim when it has something to say, omitted when it does not.
 *
 * (`title`, `commerceStoreStructure`, `aiPrompts`, `aiFileHashes`,
 * `publishKeyRegisteredAt` and `appBuilderComponents` have their own suites
 * or live in the atomic-write suite; this one covers the rest.)
 */

import type { Project } from '@/types/base';
// Everything the writer exports comes through the testUtils: it owns the
// fs/promises mock, and a direct import above it would bind the real fs.
import {
    MANIFEST_FORMAT_VERSION,
    ProjectConfigWriter,
    createTestProject,
    mockLogger,
    resetFsMocks,
    writtenManifest,
} from './projectConfigWriter.testUtils';

const PROJECT_PATH = '/projects/bodea';

describe('ProjectConfigWriter manifest fields', () => {
    let writer: ProjectConfigWriter;

    beforeEach(() => {
        resetFsMocks();
        writer = new ProjectConfigWriter(mockLogger);
    });

    async function save(overrides: Partial<Project>): Promise<Record<string, unknown>> {
        await writer.saveProjectConfig(
            createTestProject({ path: PROJECT_PATH, ...overrides }),
            PROJECT_PATH,
        );
        // The manifest is the FIRST write (to the temp file); the .env is the last.
        return writtenManifest();
    }

    describe('the fixed header', () => {
        it('stamps the current manifest format version', async () => {
            expect((await save({})).formatVersion).toBe(MANIFEST_FORMAT_VERSION);
        });

        it('lists the component ids from the keyed instances', async () => {
            const manifest = await save({
                componentInstances: {
                    'eds-storefront': {
                        id: 'eds-storefront',
                        name: 'EDS Storefront',
                        type: 'frontend',
                        status: 'ready',
                        path: '/projects/bodea/components/eds-storefront',
                    },
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'Commerce Mesh',
                        type: 'dependency',
                        status: 'ready',
                        path: '/projects/bodea/components/commerce-mesh',
                    },
                },
            });

            expect(manifest.components).toEqual(['eds-storefront', 'commerce-mesh']);
        });

        it('serialises a Date `created` as ISO', async () => {
            const manifest = await save({ created: new Date('2026-02-03T04:05:06.000Z') });

            expect(manifest.created).toBe('2026-02-03T04:05:06.000Z');
        });

        it('accepts an ISO-string `created` left over from persistence', async () => {
            // The type says Date; a manifest read straight through says string.
            const manifest = await save({
                created: '2026-02-03T04:05:06.000Z' as unknown as Date,
            });

            expect(manifest.created).toBe('2026-02-03T04:05:06.000Z');
        });
    });

    describe('datapack', () => {
        it('is written when the project records one', async () => {
            const manifest = await save({ datapack: { name: 'bodea-b2b', version: '1.2.0' } });

            expect(manifest.datapack).toEqual({ name: 'bodea-b2b', version: '1.2.0' });
        });

        it('is omitted when the project has none', async () => {
            expect('datapack' in (await save({ datapack: undefined }))).toBe(false);
        });
    });

    describe('selectedPackage and selectedStack', () => {
        it('are omitted when unset', async () => {
            const manifest = await save({ selectedPackage: undefined, selectedStack: undefined });

            expect('selectedPackage' in manifest).toBe(false);
            expect('selectedStack' in manifest).toBe(false);
        });
    });

    describe('the list fields — omitted when EMPTY, not just when unset', () => {
        it('writes selectedBlockLibraries when non-empty', async () => {
            const manifest = await save({ selectedBlockLibraries: ['citisignal', 'b2b'] });

            expect(manifest.selectedBlockLibraries).toEqual(['citisignal', 'b2b']);
        });

        it.each([
            ['selectedAddons'],
            ['selectedBlockLibraries'],
            ['customBlockLibraries'],
        ] as const)('omits %s when it is an empty array', async (field) => {
            const manifest = await save({ [field]: [] });

            expect(field in manifest).toBe(false);
        });

        it.each([
            ['selectedAddons'],
            ['selectedBlockLibraries'],
            ['customBlockLibraries'],
        ] as const)('omits %s when it is undefined', async (field) => {
            const manifest = await save({ [field]: undefined });

            expect(field in manifest).toBe(false);
        });
    });

    describe('componentApiPicks — the attributed Console API picks', () => {
        it('is written verbatim when any integration has picks', async () => {
            const picks = { 'acme-widget': ['AdobeIOEventsSDK', 'CommerceEventsSDK'] };

            expect((await save({ componentApiPicks: picks })).componentApiPicks).toEqual(picks);
        });

        it('is omitted when the map is empty', async () => {
            expect('componentApiPicks' in (await save({ componentApiPicks: {} }))).toBe(false);
        });

        it('is omitted, without throwing, when the map is undefined', async () => {
            expect('componentApiPicks' in (await save({ componentApiPicks: undefined }))).toBe(
                false,
            );
        });
    });

    describe('publishKeyRegisteredAt', () => {
        it('is omitted when the stamp is an empty string, not written as an unparseable date', async () => {
            expect('publishKeyRegisteredAt' in (await save({ publishKeyRegisteredAt: '' }))).toBe(
                false,
            );
        });
    });

    describe('pinned', () => {
        it('is written as literal true for a pinned project', async () => {
            expect((await save({ pinned: true })).pinned).toBe(true);
        });

        it('is omitted for an unpinned project rather than written as false', async () => {
            expect('pinned' in (await save({ pinned: false }))).toBe(false);
        });

        it('is omitted when never set', async () => {
            expect('pinned' in (await save({ pinned: undefined }))).toBe(false);
        });
    });
});
