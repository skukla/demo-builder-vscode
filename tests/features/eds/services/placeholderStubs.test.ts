/**
 * Placeholder stubs — the console-hygiene contract.
 *
 * The storefront's `fetchPlaceholders` (boilerplate `scripts/commerce.js`)
 * requests 16 optional label sheets per page area. Missing sheets 404 (red
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
    it('lists exactly the 16 sheets the boilerplate requests (measured 2026-08-23)', () => {
        // Measured by grepping fetchPlaceholders call sites in a live
        // boilerplate-b2b storefront's scripts/ + blocks/. A new dropin area
        // means a new request path — re-measure, then update here.
        expect([...PLACEHOLDER_STUB_PATHS].sort()).toEqual([
            'placeholders/account',
            'placeholders/auth',
            'placeholders/cart',
            'placeholders/checkout',
            'placeholders/company',
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
    it('parses as a sheet whose data is NON-empty (the hasData contract)', () => {
        // commerce.js: `jsons.some((json) => json.data?.length > 0)` — an empty
        // data array still produces a console warn, defeating the stub's job.
        const sheet = JSON.parse(buildPlaceholderStubJson());
        expect(Array.isArray(sheet.data)).toBe(true);
        expect(sheet.data.length).toBeGreaterThan(0);
        expect(sheet.total).toBe(sheet.data.length);
    });

    it('carries only the self-documenting sentinel row, never a real label key', () => {
        const sheet = JSON.parse(buildPlaceholderStubJson());
        expect(sheet.data).toHaveLength(1);
        const row = sheet.data[0];
        // A key no dropin looks up — a real label key here would silently
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
