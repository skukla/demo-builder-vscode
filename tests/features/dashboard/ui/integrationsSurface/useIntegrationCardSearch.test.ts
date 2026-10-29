/**
 * useIntegrationCardSearch — the integrations screen's filter.
 *
 * Moved out of IntegrationsScreen (EDS-8, 2026-10-08), with the `filterCards`
 * cases that used to sit in IntegrationsScreen.test.tsx. The screen suites still
 * drive the field end to end; this pins the three flags the screen renders from.
 */

import { act, renderHook } from '@testing-library/react';
import {
    filterCards,
    useIntegrationCardSearch,
} from '@/features/dashboard/ui/integrationsSurface/useIntegrationCardSearch';
import type { IntegrationCardModel } from '@/features/dashboard/ui/components/integrations/integrationCardModel';

const CARDS = [
    { id: 'a', name: 'ERP Sync', kindLabel: 'Integration', sourceLine: 'acme/erp-sync' },
    { id: 'b', name: 'Order Flow', kindLabel: 'Integration', sourceLine: 'acme/order' },
] as unknown as IntegrationCardModel[];

const NO_CARDS: IntegrationCardModel[] = [];

describe('filterCards', () => {
    it('matches a query against the card fields', () => {
        expect(filterCards(CARDS, 'order').map((c) => c.id)).toStrictEqual(['b']);
    });

    it('matches the kind label and the source line too', () => {
        expect(filterCards(CARDS, 'acme/erp').map((c) => c.id)).toStrictEqual(['a']);
        expect(filterCards(CARDS, 'integration').map((c) => c.id)).toStrictEqual(['a', 'b']);
    });

    // TRIMMED, not merely truthy: a query of spaces is an empty query. Handing
    // it to the contains-walk instead would match nothing and blank the grid.
    it('treats a whitespace-only query as no query at all', () => {
        expect(filterCards(CARDS, '   ').map((c) => c.id)).toStrictEqual(['a', 'b']);
    });
});

describe('useIntegrationCardSearch', () => {
    it('starts unfiltered', () => {
        const { result } = renderHook(() => useIntegrationCardSearch(CARDS));

        expect(result.current.searchQuery).toBe('');
        expect(result.current.visibleCards).toStrictEqual(CARDS);
        expect(result.current.isFiltering).toBe(false);
        expect(result.current.searchFoundNothing).toBe(false);
    });

    it('narrows the visible cards to the query', () => {
        const { result } = renderHook(() => useIntegrationCardSearch(CARDS));

        act(() => result.current.setSearchQuery('order'));

        expect(result.current.visibleCards.map((c) => c.id)).toStrictEqual(['b']);
        expect(result.current.isFiltering).toBe(true);
        expect(result.current.searchFoundNothing).toBe(false);
    });

    it('says nothing matched when a query empties a non-empty list', () => {
        const { result } = renderHook(() => useIntegrationCardSearch(CARDS));

        act(() => result.current.setSearchQuery('zzz'));

        expect(result.current.visibleCards).toStrictEqual([]);
        expect(result.current.searchFoundNothing).toBe(true);
    });

    it('stays quiet about a query over no cards at all', () => {
        const { result } = renderHook(() => useIntegrationCardSearch(NO_CARDS));

        act(() => result.current.setSearchQuery('zzz'));

        expect(result.current.searchFoundNothing).toBe(false);
    });

    it('does not count a query of spaces as filtering', () => {
        const { result } = renderHook(() => useIntegrationCardSearch(CARDS));

        act(() => result.current.setSearchQuery('   '));

        expect(result.current.isFiltering).toBe(false);
        expect(result.current.visibleCards).toStrictEqual(CARDS);
    });

    it('keeps the same visible list across renders when neither input changed', () => {
        const { result, rerender } = renderHook(() => useIntegrationCardSearch(CARDS));
        const first = result.current.visibleCards;

        rerender();

        expect(result.current.visibleCards).toBe(first);
    });
});
