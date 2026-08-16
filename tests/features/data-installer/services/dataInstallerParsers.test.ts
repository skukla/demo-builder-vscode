/**
 * Tests for the wire→domain normalizers.
 *
 * Fed by fixtures CAPTURED FROM THE LIVE SERVICE (then scrubbed of identifiers),
 * not hand-written. That distinction is load-bearing: the published docs are
 * wrong in seven places, so a hand-written fixture would encode the doc's lie
 * and these tests would pass against a client that cannot work. One of the seven
 * was found exactly that way — see the `overall_processing_time` case below.
 *
 * Every test here answers "does a consumer ever see a wire shape?" The answer
 * must be no.
 */

import * as path from 'path';

import {
    parseActivityLog,
    parseDataItem,
    parseDataItemInventory,
    parseDataTypeCatalog,
    parseDatapackDetail,
    parseDatapackList,
    parseHealth,
    parseInstalledDatapacks,
    parseJobFailureReason,
    parseJobStatus,
    parseProcessorOrder,
} from '@/features/data-installer/services/dataInstallerParsers';

const FIXTURES = path.join(__dirname, '../../../fixtures/data-installer');
const load = (name: string): unknown => require(path.join(FIXTURES, name));

describe('dataInstallerParsers', () => {
    describe('parseDatapackList — the catalog', () => {
        const body = load('find-datapacks.json');

        it('normalizes the live catalog without dropping entries', () => {
            const page = parseDatapackList(body);
            expect(page.count).toBe(40);
            expect(page.items).toHaveLength(40);
        });

        it('exposes identity as a name+version pair, never a bare name', () => {
            const first = parseDatapackList(body).items[0];
            expect(first.id).toEqual({ name: expect.any(String), version: expect.any(String) });
        });

        it('drops _id entirely — it is never a key', () => {
            const first = parseDatapackList(body).items[0] as unknown as Record<string, unknown>;
            expect(first._id).toBeUndefined();
            expect(JSON.stringify(first)).not.toContain('_id');
        });

        it('leaks no snake_case field to consumers', () => {
            const json = JSON.stringify(parseDatapackList(body).items);
            for (const wire of ['datapack_name', 'display_name', 'data_types', 'cover_image', 'thumbnail_image', 'created_at', 'updated_at']) {
                expect(json).not.toContain(wire);
            }
        });

        it('collapses the two image fields into art, preserving both', () => {
            const withArt = parseDatapackList(body).items.find((p) => p.art.thumbnail);
            expect(withArt).toBeDefined();
            expect(withArt!.art.thumbnail).toMatch(/^https?:\/\//);
        });

        it('omits art keys rather than emitting empty strings', () => {
            // 15 of 23 curated packs have an empty cover_image — the fallback path.
            const noCover = parseDatapackList(body).items.find((p) => !p.art.cover);
            expect(noCover).toBeDefined();
            expect(noCover!.art.cover).toBeUndefined();
        });

        it('keeps shared as a real boolean so the catalog can default to curated', () => {
            const shared = parseDatapackList(body).items.filter((p) => p.shared === true);
            expect(shared).toHaveLength(23);
        });
    });

    describe('parseDatapackDetail — the flat-metadata divergence', () => {
        const body = load('get-datapack-metadata.json');

        it('reads fields from the TOP LEVEL — there is no datapack wrapper', () => {
            const detail = parseDatapackDetail(body);
            expect(detail.id).toEqual({ name: 'citisignal_new', version: 'main' });
            expect(detail.displayName).toBe('CitiSignal (Updated Data)');
            expect(detail.dataTypes).toHaveLength(7);
        });

        it('tolerates a future wrapper, so an upstream fix is a non-event', () => {
            const wrapped = { success: true, datapack: (body as Record<string, unknown>) };
            expect(parseDatapackDetail(wrapped).id.name).toBe('citisignal_new');
        });

        it('never surfaces the success flag', () => {
            expect(JSON.stringify(parseDatapackDetail(body))).not.toContain('success');
        });
    });

    describe('parseDataItem — the stringified-payload divergence', () => {
        const body = load('get-data-item.json');

        it('parses the JSON STRING the service sends, so records is an object', () => {
            const item = parseDataItem(body, 'categories');
            expect(typeof item.records).toBe('object');
            expect(item.records).toHaveProperty('root_category');
            expect(item.rawData).toBeUndefined();
        });

        it('keeps the raw string instead of throwing when it will not parse', () => {
            const broken = { success: true, data: '{"unterminated', count: 1 };
            const item = parseDataItem(broken, 'categories');
            expect(item.records).toBeUndefined();
            expect(item.rawData).toBe('{"unterminated');
        });

        it('passes an already-parsed object straight through', () => {
            const preParsed = { success: true, data: { categories: [] }, count: 0 };
            expect(parseDataItem(preParsed, 'categories').records).toEqual({ categories: [] });
        });
    });

    describe('parseDataItemInventory — the results-not-items divergence', () => {
        const body = load('batch-ok.json');

        it('reads results[], because there is no items[] to read', () => {
            const inv = parseDataItemInventory(body);
            expect(inv.present).toEqual(expect.arrayContaining(['categories', 'products']));
            expect(inv.requestedCount).toBe(2);
        });

        it('separates present from missing using the per-entry found flag', () => {
            const mixed = {
                success: true,
                requested_count: 2,
                found_count: 1,
                missing_count: 1,
                results: [
                    { found: true, metadata: { data_type: 'categories' }, requested: { data_type: 'categories' } },
                    { found: false, requested: { data_type: 'giftcards' } },
                ],
            };
            const inv = parseDataItemInventory(mixed);
            expect(inv.present).toEqual(['categories']);
            expect(inv.missing).toEqual(['giftcards']);
        });

        it('falls back to items[] if the service ever switches to the documented shape', () => {
            const documented = { success: true, items: [{ data_type: 'products', data: '{}' }] };
            expect(parseDataItemInventory(documented).present).toEqual(['products']);
        });
    });

    describe('parseDataTypeCatalog and parseProcessorOrder — the asymmetric universes', () => {
        it('reads the 18 exportable types with their dependency edges', () => {
            const types = parseDataTypeCatalog(load('get-export-data-types.json'));
            expect(types).toHaveLength(18);
            const products = types.find((t) => t.dataType === 'products');
            expect(products!.dependsOn).toEqual(expect.arrayContaining(['categories', 'attribute_sets']));
            expect(products!.metadata).toBe('available');
        });

        it('drops processor_script — an internal detail of theirs', () => {
            expect(JSON.stringify(parseDataTypeCatalog(load('get-export-data-types.json')))).not.toContain('processor_script');
        });

        it('reads the import processor order, which includes types the export list lacks', () => {
            const imported = parseProcessorOrder(load('processor-order-import.json'));
            const exported = parseProcessorOrder(load('processor-order-export.json'));
            const importOnly = imported.filter((t) => !exported.includes(t));
            expect(importOnly).toEqual(expect.arrayContaining(['giftcards', 'product_export', 'customers_export']));
        });
    });

    describe('parseInstalledDatapacks — the spelling the DOC got wrong', () => {
        const body = load('get-installed-datapacks.json');

        it('reads overall_processing_time, the spelling the live service actually uses', () => {
            const page = parseInstalledDatapacks(body);
            expect(page.items).toHaveLength(35);
            const timed = page.items.filter((r) => typeof r.processingTimeMs === 'number');
            expect(timed.length).toBeGreaterThan(0);
            expect(timed[0].processingTimeMs).toBeGreaterThan(0);
        });

        it('omits processingTimeMs when the field is null, which 6 of 35 live rows are', () => {
            // Present-but-null, not absent. `undefined` is the honest domain value;
            // a 0 would read as "instant" and be a lie.
            const untimed = parseInstalledDatapacks(body).items.filter(
                (r) => r.processingTimeMs === undefined,
            );
            expect(untimed).toHaveLength(6);
            expect(JSON.stringify(untimed[0])).not.toContain('processingTimeMs');
        });

        it('also accepts the doc\'s triple-s spelling, in case a deployment uses it', () => {
            const tripleS = {
                success: true,
                count: 1,
                total: 1,
                datapacks: [
                    { commerce_instance: 'instance-01', datapack_name: 'x', version: 'main', data_types: [], overall_processsing_time: 1234 },
                ],
            };
            expect(parseInstalledDatapacks(tripleS).items[0].processingTimeMs).toBe(1234);
        });

        it('carries pagination through so a caller can page', () => {
            const page = parseInstalledDatapacks(body);
            expect(page.total).toBe(35);
            expect(page.count).toBe(35);
        });
    });

    describe('parseActivityLog', () => {
        const body = load('logs.json');

        it('normalizes rows and keeps the total for paging', () => {
            const page = parseActivityLog(body);
            expect(page.items).toHaveLength(10);
            expect(page.total).toBeGreaterThan(1000);
        });

        it('leaves scenario an opaque string — the documented enum is stale', () => {
            const scenarios = parseActivityLog(body).items.map((e) => e.scenario);
            expect(scenarios.some((s) => s === 'DATAPACK_ALL_ITEMS' || s === 'DATAPACK_SPECIFIC_ITEMS')).toBe(true);
        });

        it('tolerates a row with no datapack name, which real logs contain', () => {
            const page = parseActivityLog(body);
            expect(page.items.some((e) => e.id.name === '')).toBe(true);
        });
    });

    describe('parseJobStatus — the two shapes that decide terminal state', () => {
        it('reads a completed job as seven successful types with a duration', () => {
            const snap = parseJobStatus(load('datapack-process-status-complete.json'));
            expect(snap.hasRecord).toBe(true);
            expect(Object.keys(snap.perType)).toHaveLength(7);
            expect(new Set(Object.values(snap.perType))).toEqual(new Set(['success']));
            expect(snap.processingTimeMs).toBe(175496);
        });

        it('reports hasRecord false for the EMPTY map a never-started job returns', () => {
            // 200 with data_types: {} — not an error, and not distinguishable
            // from "still starting" without the runner's grace window.
            const snap = parseJobStatus(load('datapack-process-status-neverstarted.json'));
            expect(snap.hasRecord).toBe(false);
            expect(snap.perType).toEqual({});
            expect(snap.processingTimeMs).toBeUndefined();
        });

        it('also treats the documented no-request-log error as hasRecord false', () => {
            const errBody = { error: 'No request log found for this activation_id' };
            expect(parseJobStatus(errBody, 'activation-01').hasRecord).toBe(false);
        });
    });

    describe('parseJobFailureReason — why nothing happened', () => {
        it('surfaces the validation error the activation echo carries', () => {
            const reason = parseJobFailureReason(load('async-process-status-invalidinput.json'));
            expect(reason!.error).toContain('Must provide one of');
        });

        it('returns undefined for the aged in_progress lie, which explains nothing', () => {
            expect(parseJobFailureReason(load('async-process-status-aged.json'))).toBeUndefined();
        });
    });

    describe('parseHealth', () => {
        it('reports reachable with the env checks the endpoint exposes', () => {
            const health = parseHealth(load('health-check.json'));
            expect(health.reachable).toBe(true);
            expect(health.envChecks).toHaveProperty('IMS_VALIDATION_ENABLED');
        });
    });

    describe('tolerance — a shape change must degrade, never throw', () => {
        it.each([
            ['empty object', {}],
            ['null', null],
            ['a string', 'nope'],
            ['an array', []],
        ])('parses %s without throwing', (_label, body) => {
            expect(() => parseDatapackList(body)).not.toThrow();
            expect(() => parseDatapackDetail(body)).not.toThrow();
            expect(() => parseDataTypeCatalog(body)).not.toThrow();
            expect(() => parseInstalledDatapacks(body)).not.toThrow();
            expect(() => parseActivityLog(body)).not.toThrow();
            expect(() => parseJobStatus(body)).not.toThrow();
            expect(() => parseHealth(body)).not.toThrow();
        });

        it('skips a malformed row instead of failing the whole list', () => {
            const partly = {
                success: true,
                count: 2,
                datapacks: [
                    { datapack_name: 'good', version: 'main', display_name: 'Good', data_types: [] },
                    { version: 'main' }, // no name — unusable as an identity
                ],
            };
            const page = parseDatapackList(partly);
            expect(page.items).toHaveLength(1);
            expect(page.items[0].id.name).toBe('good');
        });

        it('ignores unknown extra fields rather than choking on them', () => {
            const future = {
                success: true,
                count: 1,
                datapacks: [
                    { datapack_name: 'x', version: 'main', display_name: 'X', data_types: [], schema_version: 9, brand_new: {} },
                ],
            };
            const item = parseDatapackList(future).items[0] as unknown as Record<string, unknown>;
            expect(item.schema_version).toBeUndefined();
            expect(item.brand_new).toBeUndefined();
            expect(item.displayName).toBe('X');
        });
    });
});

// ─── the pagination envelope must not invent a total ─────────────────────────
//
// `total` used to fall back to `items.length`. That is invisible while callers
// fetch everything, and wrong the moment a page size applies: measured live
// 2026-08-16, `find_datapacks` answered `total: 20` for a 23-row catalog at
// limit=20, and `total: 5` at limit=5 — a number that reads as authoritative
// while silently hiding rows. The activity endpoint DOES send a total (1,099),
// which is why the bug survived: one of the two paged endpoints looked right.
describe('paged envelope — total is reported, never fabricated', () => {
    // Row shape copied from the captured fixture, whose top-level keys are
    // ['count','datapacks','duration','success'] — the catalog endpoint sends
    // no total at all, which is the whole point.
    const WIRE_ROW = {
        _id: 'objectid-03',
        datapack_name: 'AFREEN-LG',
        version: 'dev',
        display_name: 'My Test Datapack',
        data_types: ['products'],
        shared: false,
    };

    it('omits total when the service does not send one', () => {
        const page = parseDatapackList({
            datapacks: [WIRE_ROW, { ...WIRE_ROW, datapack_name: 'OTHER' }],
            count: 2,
            limit: 2,
        });

        expect(page.items).toHaveLength(2);
        expect(page.count).toBe(2);
        // Absent, NOT 2. An agent seeing count === limit and no total knows to page.
        expect(page.total).toBeUndefined();
        expect('total' in page).toBe(false);
    });

    it('passes through a real total when the service sends one', () => {
        const page = parseDatapackList({ datapacks: [WIRE_ROW], count: 1, total: 23, limit: 1 });
        expect(page.total).toBe(23);
    });

    // The captured catalog fixture is the proof this was never a hypothetical.
    it('the real catalog fixture carries no total', () => {
        expect(parseDatapackList(load('find-datapacks.json')).total).toBeUndefined();
    });
});
