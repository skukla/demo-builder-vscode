/**
 * Placeholder stubs — the console-hygiene contract.
 *
 * The storefront's `fetchPlaceholders` (boilerplate `scripts/commerce.js`)
 * requests an optional label sheet per page area (17 names across boilerplate versions). Missing sheets 404 (red
 * browser console lines no JS can suppress) and an EMPTY sheet still warns
 * ("No placeholder data found" — the code checks `json.data?.length > 0`).
 * The stubs therefore carry ONE self-documenting sentinel row: a key no
 * dropin ever looks up, whose value tells an inspecting human what it is.
 * A stub is a stand-in for a sheet nobody authored. It does NOT yield to a real
 * one: measured live 2026-10-12, a stub in the repository stops the DA.live sheet
 * at the same path from being served. So the areas that get a stub are decided
 * per source (`placeholderStubPathsFor`).
 */

import {
    PLACEHOLDER_STUB_PATHS,
    addPlaceholderStubOverrides,
    buildPlaceholderStubJson,
    isPlaceholderStub,
    placeholderLabelFiles,
    placeholderStubPathsFor,
    placeholderStubTreeEntries,
    removeShadowingPlaceholderFiles,
} from '@/features/eds/services/placeholderStubs';
import type { GitHubFileContent } from '@/features/eds/services/types';
import { createMockLogger } from '../../../helpers/loggerFake';
import {
    B2B_TEMPLATE_CHECKOUT_JSON,
    B2B_TEMPLATE_CHECKOUT_ROWS,
    OLD_SINGLE_SHEET_STUB_JSON,
} from '../../../helpers/placeholderLabelFixtures';
import { installSiteFetch, restoreFetch } from '../../../helpers/siteFetchFake';

afterEach(restoreFetch);

describe('PLACEHOLDER_STUB_PATHS', () => {
    it('lists every sheet a boilerplate version requests (measured 2026-08-23 and 2026-10-12)', () => {
        // Measured by grepping fetchPlaceholders call sites in a live
        // boilerplate-b2b storefront's scripts/ + blocks/. A new dropin area
        // means a new request path — re-measure, then update here.
        // `company-switcher` is what a storefront on boilerplate 4.0.1 asks for;
        // Adobe stopped asking in April 2026 (template #1213). The list is the union.
        expect([...PLACEHOLDER_STUB_PATHS].sort()).toEqual([
            'placeholders/account',
            'placeholders/auth',
            'placeholders/cart',
            'placeholders/checkout',
            'placeholders/company',
            'placeholders/company-switcher',
            'placeholders/global',
            'placeholders/order',
            'placeholders/payment-services',
            'placeholders/pdp',
            'placeholders/purchase-order',
            'placeholders/quick-order',
            'placeholders/quote-management',
            'placeholders/recommendations',
            'placeholders/requisition-list',
            'placeholders/search',
            'placeholders/wishlist',
        ]);
    });
});

describe('buildPlaceholderStubJson', () => {
    // What the file must BE for a storefront to get an answer. The storefront asks for
    // `placeholders/<area>.json?sheet=data` (scripts/commerce.js). Measured live
    // 2026-10-12 on a scratch storefront: a file in the repository shaped as ONE sheet
    // answers 404 to that query (the stub's shape until then, on three storefronts),
    // and a file shaped as a multi-sheet document with a sheet called `data` answers
    // 200, served as that sheet.
    const stub = (): Record<string, unknown> => JSON.parse(buildPlaceholderStubJson()) as Record<string, unknown>;
    const dataSheet = (): { total: number; offset: number; limit: number; data: Array<Record<string, string>> } =>
        stub().data as { total: number; offset: number; limit: number; data: Array<Record<string, string>> };

    it('is a multi-sheet document whose one sheet is called data', () => {
        expect(stub()[':type']).toBe('multi-sheet');
        expect(stub()[':names']).toStrictEqual(['data']);
        expect(stub()[':version']).toBe(3);
    });

    it('gives that sheet a NON-empty row list (the hasData contract)', () => {
        // commerce.js: `jsons.some((json) => json.data?.length > 0)` — an empty
        // data array still produces a console warn, defeating the stub's job.
        const sheet = dataSheet();
        expect(Array.isArray(sheet.data)).toBe(true);
        expect(sheet.data.length).toBeGreaterThan(0);
        expect(sheet).toMatchObject({ total: sheet.data.length, limit: sheet.data.length, offset: 0 });
    });

    it('carries only the self-documenting sentinel row, never a real label key', () => {
        const sheet = dataSheet();
        expect(sheet.data).toHaveLength(1);
        const row = sheet.data[0];
        // A key nothing looks up — a real label key here would silently
        // override a compiled-in default.
        expect(row.Key).toBe('_stub');
        expect(row.Value).toMatch(/DA\.live/);
    });

    it('does not claim built-in labels take over: some blocks have none', () => {
        // The B2B checkout block reads Checkout.Summary.heading and .Edit with no fallback,
        // so "the built-in defaults apply until then" was false there: it showed "undefined".
        expect(dataSheet().data[0].Value).not.toMatch(/defaults apply/);
    });
});

/**
 * Which label file each stubbed area gets. Where the repository's tree already holds a label
 * file that is not our stub, its rows are kept, in the shape the storefront can read. Measured
 * 2026-10-22 on a live storefront made from the B2B template: the stub had replaced the
 * template's placeholders/checkout.json, and the checkout's item-list heading and Edit link
 * read "undefined".
 */
describe('placeholderLabelFiles', () => {
    const multiSheet = (content: string | undefined): Record<string, unknown> =>
        JSON.parse(content ?? 'null') as Record<string, unknown>;
    const reader = (files: Record<string, string>) =>
        jest.fn(async (path: string): Promise<string | undefined> => files[path]);

    it("keeps the B2B template's two checkout labels, as a sheet called data, with no stub row", async () => {
        const files = await placeholderLabelFiles(
            ['placeholders/checkout', 'placeholders/cart'],
            reader({ 'placeholders/checkout.json': B2B_TEMPLATE_CHECKOUT_JSON }),
        );

        const checkout = multiSheet(files.get('placeholders/checkout.json'));
        expect(checkout[':type']).toBe('multi-sheet');
        expect(checkout[':names']).toStrictEqual(['data']);
        expect(checkout.data).toStrictEqual({ total: 2, offset: 0, limit: 2, data: B2B_TEMPLATE_CHECKOUT_ROWS });
        expect(files.get('placeholders/checkout.json')).not.toContain('_stub');
        // Control: an area with no file gets the plain stub.
        expect(files.get('placeholders/cart.json')).toBe(buildPlaceholderStubJson());
    });

    it('keeps the rows of a label file already in the multi-sheet shape', async () => {
        const authored = JSON.stringify({ data: { total: 1, offset: 0, limit: 1, data: [{ Key: 'Cart.Title', Value: 'Basket' }] }, ':names': ['data'], ':version': 3, ':type': 'multi-sheet' });

        const files = await placeholderLabelFiles(['placeholders/cart'], reader({ 'placeholders/cart.json': authored }));

        expect((multiSheet(files.get('placeholders/cart.json')).data as { data: unknown }).data).toStrictEqual([
            { Key: 'Cart.Title', Value: 'Basket' },
        ]);
    });

    it.each([
        ['our current stub', buildPlaceholderStubJson()],
        ['our older single-sheet stub', OLD_SINGLE_SHEET_STUB_JSON],
        ['a file that is not JSON', 'not json'],
        ['a sheet with no rows', '{"data":[]}'],
        ['JSON with no rows at all', '{"other":true}'],
    ])('writes the plain stub over %s', async (_name, content) => {
        const files = await placeholderLabelFiles(['placeholders/checkout'], reader({ 'placeholders/checkout.json': content }));

        expect(files.get('placeholders/checkout.json')).toBe(buildPlaceholderStubJson());
    });

    it('writes the plain stub when the read fails, and reads only the areas it stubs', async () => {
        const read = jest.fn(async (): Promise<string | undefined> => {
            throw new Error('rate limited');
        });

        const files = await placeholderLabelFiles(['placeholders/checkout'], read);

        expect([...files.entries()]).toStrictEqual([['placeholders/checkout.json', buildPlaceholderStubJson()]]);
        expect(read.mock.calls).toStrictEqual([['placeholders/checkout.json']]);
    });
});

/**
 * Recognising a file Demo Builder wrote: an update repairs only those, and never a label
 * file the SC or a colleague authored.
 */
describe('isPlaceholderStub', () => {
    it.each([
        ['our current stub', buildPlaceholderStubJson()],
        ['our older single-sheet stub', OLD_SINGLE_SHEET_STUB_JSON],
    ])('recognises %s', (_name, content) => {
        expect(isPlaceholderStub(content)).toBe(true);
    });

    it.each([
        ["the B2B template's own checkout labels", B2B_TEMPLATE_CHECKOUT_JSON],
        ['a file that is not JSON', 'not json'],
        ['a sheet with no rows', '{"data":[]}'],
    ])('does not take %s for a stub', (_name, content) => {
        expect(isPlaceholderStub(content)).toBe(false);
    });
});

describe('placeholderStubPathsFor: which areas get a stub for this source', () => {
    // Measured live 2026-10-12 on a reset of a project copied from a colleague's
    // demo: a stub in the repository at placeholders/<area>.json STOPS the copied
    // DA.live sheet at the same path from being served. All 16 of the source's
    // label sheets were written and published, and the site went on serving the
    // stub's one row. So an area the source has a sheet for gets no stub.
    const SOURCE = { org: 'colleague', site: 'their-demo' };
    const BASE = 'https://main--their-demo--colleague.aem.live';

    it('asks the source for every area, at the sheet a storefront reads', async () => {
        const site = installSiteFetch([]);

        await placeholderStubPathsFor(SOURCE);

        expect(site.asked().sort()).toEqual(PLACEHOLDER_STUB_PATHS.map((p) => `${BASE}/${p}.json`).sort());
    });

    it('leaves out every area the source serves a sheet for', async () => {
        installSiteFetch([`${BASE}/placeholders/cart.json`, `${BASE}/placeholders/global.json`]);

        const stubs = await placeholderStubPathsFor(SOURCE);

        expect(stubs).not.toContain('placeholders/cart');
        expect(stubs).not.toContain('placeholders/global');
        expect(stubs).toHaveLength(PLACEHOLDER_STUB_PATHS.length - 2);
        expect(stubs).toContain('placeholders/checkout');
    });

    it('stubs an area whose URL answers 200 with something that is not a sheet', async () => {
        installSiteFetch({ [`${BASE}/placeholders/cart.json`]: { notASheet: true } });

        expect(await placeholderStubPathsFor(SOURCE)).toEqual([...PLACEHOLDER_STUB_PATHS]);
    });

    it('stubs every area when the source cannot be reached', async () => {
        installSiteFetch(
            [],
            PLACEHOLDER_STUB_PATHS.map((p) => `${BASE}/${p}.json`),
        );

        expect(await placeholderStubPathsFor(SOURCE)).toEqual([...PLACEHOLDER_STUB_PATHS]);
    });

    it('stubs every area, and asks nobody, when there is no source', async () => {
        const site = installSiteFetch([]);

        expect(await placeholderStubPathsFor(undefined)).toEqual([...PLACEHOLDER_STUB_PATHS]);
        expect(site.asked()).toStrictEqual([]);
    });
});

const LABEL_FILES = new Map([
    ['placeholders/global.json', buildPlaceholderStubJson()],
    ['placeholders/auth.json', buildPlaceholderStubJson()],
]);

describe('addPlaceholderStubOverrides', () => {
    it('adds one <path>.json override per area it is given without touching existing entries', () => {
        const overrides = new Map<string, string>([['fstab.yaml', 'mountpoint']]);
        addPlaceholderStubOverrides(overrides, LABEL_FILES);

        expect(overrides.get('fstab.yaml')).toBe('mountpoint');
        expect([...overrides.keys()]).toEqual([
            'fstab.yaml',
            'placeholders/global.json',
            'placeholders/auth.json',
        ]);
        expect(overrides.get('placeholders/global.json')).toBe(buildPlaceholderStubJson());
    });
});

describe('placeholderStubTreeEntries', () => {
    it('returns one blob entry per area it is given for a commitTreeToBranch call', () => {
        const entries = placeholderStubTreeEntries(LABEL_FILES);
        expect(entries.map((entry) => entry.path)).toEqual([
            'placeholders/global.json',
            'placeholders/auth.json',
        ]);
        for (const entry of entries) {
            expect(entry.mode).toBe('100644');
            expect(entry.type).toBe('blob');
            expect(entry.content).toBe(buildPlaceholderStubJson());
        }
    });
});

/**
 * A template file at a label-sheet path hides the copied sheet (EDS-53).
 *
 * The B2B template ships `placeholders/checkout.json`, a two-row file in the old
 * bare-list shape. Every reset and creation copied it into the repository, the
 * repository file wins over the DA.live sheet at the same path, and the publish
 * service refused to preview CitiSignal's checkout sheet ("invalid sheet; unknown
 * type"). Deleting the file on the scratch site made the sheet preview (owner,
 * 2026-10-18). So a file is removed at every area the content source serves a sheet
 * for, and only there: at an area it serves none for, the file written there (a stub, or
 * the template's own labels kept) is what the storefront reads.
 */
describe('removeShadowingPlaceholderFiles', () => {
    const AT = { owner: 'skukla', repo: 'my-commerce-demo', ref: 'reset-commit' };
    const TEMPLATE_CHECKOUT = '{"data":[{"Key":"Checkout.Summary.Edit","Value":"Edit"}]}';
    /** Every area but these, as the content source would leave them stubbed. */
    const stubbedExcept = (...served: string[]): string[] =>
        PLACEHOLDER_STUB_PATHS.filter((sheetPath) => !served.includes(sheetPath));

    function fileOps(files: Record<string, string>) {
        return {
            getFileContent: jest.fn(
                async (_owner: string, _repo: string, path: string): Promise<GitHubFileContent | null> =>
                    path in files ? { content: files[path], sha: `sha-${path}`, path, encoding: 'base64' } : null,
            ),
            commitTreeToBranch: jest.fn().mockResolvedValue('new-commit'),
        };
    }

    it('deletes a template file at an area the source serves, in one commit, reading the given ref', async () => {
        const ops = fileOps({
            'placeholders/checkout.json': TEMPLATE_CHECKOUT,
            'placeholders/company.json': buildPlaceholderStubJson(),
        });

        const removed = await removeShadowingPlaceholderFiles(
            ops, AT, stubbedExcept('placeholders/checkout'), createMockLogger(),
        );

        expect(removed).toEqual(['placeholders/checkout.json']);
        expect(ops.getFileContent).toHaveBeenCalledWith(
            'skukla', 'my-commerce-demo', 'placeholders/checkout.json', 'reset-commit',
        );
        expect(ops.commitTreeToBranch).toHaveBeenCalledTimes(1);
        expect(ops.commitTreeToBranch).toHaveBeenCalledWith(
            'skukla',
            'my-commerce-demo',
            'main',
            [{ path: 'placeholders/checkout.json', mode: '100644', type: 'blob', sha: null }],
            expect.any(String),
        );
    });

    it('keeps what was written at an area the source serves no sheet for, and does not read it', async () => {
        // The two rules agree: the template's checkout labels are kept where the source has no
        // checkout sheet (placeholderLabelFiles), so they are not then deleted here.
        const ops = fileOps({
            'placeholders/cart.json': buildPlaceholderStubJson(),
            'placeholders/checkout.json': TEMPLATE_CHECKOUT,
        });

        const removed = await removeShadowingPlaceholderFiles(ops, AT, [...PLACEHOLDER_STUB_PATHS], createMockLogger());

        expect(removed).toStrictEqual([]);
        expect(ops.getFileContent).not.toHaveBeenCalled();
        expect(ops.commitTreeToBranch).not.toHaveBeenCalled();
    });

    it('deletes our own stub too at an area the source serves: it hides the sheet just the same', async () => {
        const ops = fileOps({ 'placeholders/cart.json': OLD_SINGLE_SHEET_STUB_JSON });

        const removed = await removeShadowingPlaceholderFiles(
            ops, AT, stubbedExcept('placeholders/cart'), createMockLogger(),
        );

        expect(removed).toStrictEqual(['placeholders/cart.json']);
    });

    it('commits nothing when no served area has a file', async () => {
        const ops = fileOps({});

        expect(
            await removeShadowingPlaceholderFiles(ops, AT, stubbedExcept('placeholders/cart'), createMockLogger()),
        ).toStrictEqual([]);
        expect(ops.commitTreeToBranch).not.toHaveBeenCalled();
    });

    it('never throws: a failed commit costs the sheet, not the reset', async () => {
        const ops = fileOps({ 'placeholders/checkout.json': TEMPLATE_CHECKOUT });
        ops.commitTreeToBranch.mockRejectedValue(new Error('409'));

        await expect(
            removeShadowingPlaceholderFiles(ops, AT, stubbedExcept('placeholders/checkout'), createMockLogger()),
        ).resolves.toStrictEqual([]);
    });
});
