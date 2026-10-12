/**
 * Placeholder stubs — the console-hygiene contract.
 *
 * The storefront's `fetchPlaceholders` (boilerplate `scripts/commerce.js`)
 * requests an optional label sheet per page area (17 names across boilerplate versions). Missing sheets 404 (red
 * browser console lines no JS can suppress) and an EMPTY sheet still warns
 * ("No placeholder data found" — the code checks `json.data?.length > 0`).
 * The stubs therefore carry ONE self-documenting sentinel row: a key no
 * dropin ever looks up, whose value tells an inspecting human what it is.
 * Real label overrides are DA.live content and shadow these code files
 * (Helix content-over-code).
 */

import {
    PLACEHOLDER_STUB_PATHS,
    addPlaceholderStubOverrides,
    buildPlaceholderStubJson,
    placeholderStubTreeEntries,
} from '@/features/eds/services/placeholderStubs';

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
});

describe('addPlaceholderStubOverrides', () => {
    it('adds one <path>.json override per sheet without touching existing entries', () => {
        const overrides = new Map<string, string>([['fstab.yaml', 'mountpoint']]);
        addPlaceholderStubOverrides(overrides);

        expect(overrides.get('fstab.yaml')).toBe('mountpoint');
        expect(overrides.size).toBe(1 + PLACEHOLDER_STUB_PATHS.length);
        expect(overrides.get('placeholders/global.json')).toBe(buildPlaceholderStubJson());
    });
});

describe('placeholderStubTreeEntries', () => {
    it('returns one blob entry per sheet for a commitTreeToBranch call', () => {
        const entries = placeholderStubTreeEntries();
        expect(entries).toHaveLength(PLACEHOLDER_STUB_PATHS.length);
        for (const entry of entries) {
            expect(entry.mode).toBe('100644');
            expect(entry.type).toBe('blob');
            expect(entry.path.endsWith('.json')).toBe(true);
            expect(entry.content).toBe(buildPlaceholderStubJson());
        }
    });
});
