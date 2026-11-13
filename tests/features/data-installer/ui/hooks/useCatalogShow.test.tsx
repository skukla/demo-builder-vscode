/**
 * useCatalogShow's hideRemoved: a removed version leaves the list as the flyout closes, not when
 * the list next comes back (owner, 2026-11-05: the card sat there for seconds after the removal).
 */

import { act, renderHook } from '@testing-library/react';
import type { CatalogPage, DatapackSummary } from '@/features/data-installer/types';
import { useCatalogShow } from '@/features/data-installer/ui/hooks/useCatalogShow';

const NONE: ReadonlySet<string> = new Set();

function pack(name: string, version: string): DatapackSummary {
    return { id: { name, version }, displayName: name, shared: false, dataTypes: [], art: {}, store: 'library', mine: true };
}

function pageOf(...items: DatapackSummary[]): CatalogPage {
    return { items, count: items.length, total: items.length };
}

const names = (groups: Array<{ name: string; versions: unknown[] }>): string[] => groups.map((group) => group.name);

describe('useCatalogShow hideRemoved', () => {
    it('takes the removed version off at once, and a pack with others left keeps its card', () => {
        const first = pageOf(pack('acme', '1'), pack('bodea', '1'), pack('bodea', '2'));
        const { result } = renderHook(() => useCatalogShow({ page: first, installedPacks: NONE, held: undefined, query: '', heldFirst: true }));

        act(() => result.current.hideRemoved({ name: 'acme', version: '1' }));
        act(() => result.current.hideRemoved({ name: 'bodea', version: '2' }));

        expect(names(result.current.shown)).toEqual(['bodea']);
        expect(result.current.shown[0].versions).toHaveLength(1);
    });

    it('lets the next list decide: a version saved again under the same name comes back', () => {
        let page = pageOf(pack('acme', 'main'));
        const { result, rerender } = renderHook(() =>
            useCatalogShow({ page, installedPacks: NONE, held: undefined, query: '', heldFirst: true }),
        );
        act(() => result.current.hideRemoved({ name: 'acme', version: 'main' }));
        expect(result.current.shown).toStrictEqual([]);

        page = pageOf(pack('acme', 'main'));
        rerender();

        expect(names(result.current.shown)).toEqual(['acme']);
    });
});

// Clarity 1.13 (step-04 S10): the filter says when its matches sit under another Show choice.
describe('useCatalogShow elsewhere', () => {
    const colleague: DatapackSummary = { ...pack('bodea', '1'), mine: false };

    it('says where a query that matches nothing here does match', () => {
        const page = pageOf(pack('acme', '1'), colleague);
        const { result } = renderHook(() => useCatalogShow({ page, installedPacks: NONE, held: undefined, query: 'bodea', heldFirst: true }));

        expect(result.current.filtered).toStrictEqual([]);
        expect(result.current.elsewhere).toEqual({ show: 'community', count: 1 });
    });

    it('says nothing while the query matches here, or with no query', () => {
        const page = pageOf(pack('acme', '1'), colleague);
        const matching = renderHook(() => useCatalogShow({ page, installedPacks: NONE, held: undefined, query: 'acme', heldFirst: true }));
        const empty = renderHook(() => useCatalogShow({ page, installedPacks: NONE, held: undefined, query: '', heldFirst: true }));

        expect(matching.result.current.elsewhere).toBeUndefined();
        expect(empty.result.current.elsewhere).toBeUndefined();
    });
});
