/**
 * useIntegrationCardSearch — the integrations screen's filter.
 *
 * Owns the query and narrows the screen's cards with it, so the header count and
 * the grid read the same filtered list. Moved out of `IntegrationsScreen`
 * (EDS-8, 2026-10-08) unchanged.
 *
 * @module features/dashboard/ui/integrationsSurface/useIntegrationCardSearch
 */

import { useMemo, useState } from 'react';
import type { IntegrationCardModel } from '../components/integrations/integrationCardModel';
import { matchesSearchFields } from '@/core/ui/hooks/useSearchFilter';

/** The card fields a search query matches against. */
const CARD_SEARCH_FIELDS = ['name', 'kindLabel', 'sourceLine'] as const;

/**
 * Filter cards by a search query.
 *
 * Delegates to the shared `matchesSearchFields` predicate rather than
 * re-implementing the lowercase-contains walk a third time (this surface and
 * ProjectsDashboard had each hand-rolled it while `useSearchFilter` sat unused —
 * architecture-duplication scan, 2026-07-31). Kept as a named export because the
 * screen owns its query state and the suite tests this directly.
 *
 * No empty-query short-circuit: `matchesSearchFields` trims the query itself and
 * returns true for an empty needle (core/ui/hooks/useSearchFilter.ts), so the
 * guard that used to sit here returned the same cards the filter already did.
 */
export function filterCards(cards: IntegrationCardModel[], query: string): IntegrationCardModel[] {
    return cards.filter((card) => matchesSearchFields(card, CARD_SEARCH_FIELDS, query));
}

/** The query, its setter, and what it leaves on screen. */
export interface IntegrationCardSearch {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    /** The cards the query matches — all of them for an empty query. */
    visibleCards: IntegrationCardModel[];
    /** True while the query narrows anything. */
    isFiltering: boolean;
    /** True when a query matched none of a non-empty list. */
    searchFoundNothing: boolean;
}

/** Search state over the screen's cards. */
export function useIntegrationCardSearch(cards: IntegrationCardModel[]): IntegrationCardSearch {
    const [searchQuery, setSearchQuery] = useState('');
    const visibleCards = useMemo(() => filterCards(cards, searchQuery), [cards, searchQuery]);
    // Trimmed like the filter itself: a query of spaces narrows nothing.
    const isFiltering = searchQuery.trim().length > 0;
    // Named rather than inlined: a 4-operand && chain in JSX trips the
    // complex-expression SOP scan (tests/sop/complex-expressions.test.ts).
    const searchFoundNothing =
        Boolean(searchQuery) && visibleCards.length === 0 && cards.length > 0;
    return { searchQuery, setSearchQuery, visibleCards, isFiltering, searchFoundNothing };
}
