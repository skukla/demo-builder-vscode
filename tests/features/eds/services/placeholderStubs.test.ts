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
    placeholderStubPathsFor,
    placeholderStubTreeEntries,
    removeShadowingPlaceholderFiles,
} from '@/features/eds/services/placeholderStubs';
import type { GitHubFileContent } from '@/features/eds/services/types';
import { createMockLogger } from '../../../helpers/loggerFake';
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

describe('addPlaceholderStubOverrides', () => {
    it('adds one <path>.json override per area it is given without touching existing entries', () => {
        const overrides = new Map<string, string>([['fstab.yaml', 'mountpoint']]);
        addPlaceholderStubOverrides(overrides, ['placeholders/global', 'placeholders/auth']);

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
        const entries = placeholderStubTreeEntries(['placeholders/global', 'placeholders/auth']);
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
 * 2026-10-18). After the stubs are written, a file at a label-sheet path that is
 * NOT our stub can only be such a leftover, and the area has a real sheet.
 */
describe('removeShadowingPlaceholderFiles', () => {
    const REPO = { owner: 'skukla', repo: 'my-commerce-demo' };
    const TEMPLATE_CHECKOUT = '{"data":[{"Key":"Checkout.Summary.Edit","Value":"Edit"}]}';

    function fileOps(files: Record<string, string>) {
        return {
            getFileContent: jest.fn(
                async (_owner: string, _repo: string, path: string): Promise<GitHubFileContent | null> =>
                    path in files ? { content: files[path], sha: `sha-${path}`, path, encoding: 'base64' } : null,
            ),
            commitTreeToBranch: jest.fn().mockResolvedValue('new-commit'),
        };
    }

    it('deletes a template file at a label-sheet path, in one commit, reading the given ref', async () => {
        const ops = fileOps({
            'placeholders/checkout.json': TEMPLATE_CHECKOUT,
            'placeholders/company.json': buildPlaceholderStubJson(),
        });

        const removed = await removeShadowingPlaceholderFiles(ops, REPO, 'reset-commit', createMockLogger());

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

    it('keeps our own stubs, which stand in for sheets nobody authored', async () => {
        const ops = fileOps({ 'placeholders/cart.json': buildPlaceholderStubJson() });

        const removed = await removeShadowingPlaceholderFiles(ops, REPO, 'c', createMockLogger());

        expect(removed).toStrictEqual([]);
        expect(ops.commitTreeToBranch).not.toHaveBeenCalled();
    });

    it('commits nothing when no label-sheet path has a file', async () => {
        const ops = fileOps({});

        expect(await removeShadowingPlaceholderFiles(ops, REPO, 'c', createMockLogger())).toStrictEqual([]);
        expect(ops.commitTreeToBranch).not.toHaveBeenCalled();
    });

    it('never throws: a failed commit costs the sheet, not the reset', async () => {
        const ops = fileOps({ 'placeholders/checkout.json': TEMPLATE_CHECKOUT });
        ops.commitTreeToBranch.mockRejectedValue(new Error('409'));

        await expect(
            removeShadowingPlaceholderFiles(ops, REPO, 'c', createMockLogger()),
        ).resolves.toStrictEqual([]);
    });
});
