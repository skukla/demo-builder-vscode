/**
 * Runtime-surface resolver (ADR-008 consumer) — unit tests.
 *
 * Verifies the merge is a strict floor over the static hand list (never removes),
 * that the generated derived/residual blocks map into the right categories, and
 * that fetch failure / no-source degrade to exactly the static inventory.
 */

import {
    mergeRuntimeSurfaces,
    getRuntimeSurfaces,
    _clearRuntimeSurfaceCacheForTests,
    type GeneratedRuntimeSurfaces,
    type RuntimeSurfaceSource,
} from '@/features/eds/services/runtimeSurfaceResolver';
import { RUNTIME_SURFACES } from '@/features/eds/services/runtimeSurfaceInventory';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), trace: jest.fn() } as never;
const source: RuntimeSurfaceSource = { owner: 'skukla', repo: 'eds-demo-patches', path: 'b2b' };

beforeEach(() => _clearRuntimeSurfaceCacheForTests());

describe('mergeRuntimeSurfaces', () => {
    it('returns the static base unchanged when generated is null', () => {
        expect(mergeRuntimeSurfaces(null)).toEqual(RUNTIME_SURFACES);
    });

    it('unions derived fragments + navFooter into fragments, and residual into spreadsheets', () => {
        const base = {
            spreadsheets: ['/placeholders'],
            fragments: ['/nav'],
            authPages: [{ path: '/customer/login', blockClass: 'commerce-login' }],
        };
        const generated: GeneratedRuntimeSurfaces = {
            derived: {
                fragments: ['/customer/sidebar-fragment'],
                navFooter: ['/nav', '/footer'],
                customerPages: ['/customer/account'],
            },
            residual: { spreadsheets: ['/metadata'] },
        };
        const merged = mergeRuntimeSurfaces(generated, base);
        expect(merged.fragments.sort()).toEqual(['/customer/sidebar-fragment', '/footer', '/nav'].sort());
        expect(merged.spreadsheets.sort()).toEqual(['/metadata', '/placeholders'].sort());
    });

    it('is a strict floor — never drops a base entry, even if generated omits it', () => {
        const base = {
            spreadsheets: ['/placeholders', '/sitemap'],
            fragments: ['/nav', '/footer'],
            authPages: [{ path: '/customer/account', blockClass: 'commerce-account' }],
        };
        const merged = mergeRuntimeSurfaces({ derived: { fragments: [] }, residual: { spreadsheets: [] } }, base);
        expect(merged.spreadsheets).toEqual(expect.arrayContaining(base.spreadsheets));
        expect(merged.fragments).toEqual(expect.arrayContaining(base.fragments));
        expect(merged.authPages).toEqual(base.authPages); // authPages never altered by the merge
    });

    it('does not synthesize authPages from customerPages (blockClass is human-owned)', () => {
        const base = { spreadsheets: [], fragments: [], authPages: [] };
        const merged = mergeRuntimeSurfaces({ derived: { customerPages: ['/customer/orders'] } }, base);
        expect(merged.authPages).toEqual([]);
    });
});

describe('getRuntimeSurfaces', () => {
    it('returns the static inventory when no source is given (no fetch)', async () => {
        const fetcher = jest.fn();
        const result = await getRuntimeSurfaces(undefined, logger, { fetcher: fetcher as never });
        expect(result).toBe(RUNTIME_SURFACES);
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('merges the generated surfaces when the fetch succeeds', async () => {
        const fetcher = jest.fn().mockResolvedValue({
            derived: { fragments: ['/brand-new-fragment'] },
        } as GeneratedRuntimeSurfaces);
        const result = await getRuntimeSurfaces(source, logger, { fetcher: fetcher as never });
        expect(result.fragments).toContain('/brand-new-fragment');
        // floor preserved
        expect(result.fragments).toEqual(expect.arrayContaining(RUNTIME_SURFACES.fragments));
    });

    it('ignores a ledger still shipping the retired placeholderSheets field (lenient parsing)', async () => {
        // Sheets are content since 2026-08-23; a generated runtime-surfaces.json
        // that still carries the field must be read without error and without
        // resurrecting the surface.
        const fetcher = jest.fn().mockResolvedValue({
            derived: { placeholderSheets: ['placeholders/ghost'] },
        } as GeneratedRuntimeSurfaces);
        const result = await getRuntimeSurfaces(source, logger, { fetcher: fetcher as never });
        expect('placeholderSheets' in result).toBe(false);
        expect(result.fragments).toEqual(expect.arrayContaining(RUNTIME_SURFACES.fragments));
    });

    it('falls back to the static inventory when the fetch returns null', async () => {
        const fetcher = jest.fn().mockResolvedValue(null);
        const result = await getRuntimeSurfaces(source, logger, { fetcher: fetcher as never });
        expect(result).toEqual(RUNTIME_SURFACES);
    });
});
