/**
 * CatalogStage — the Add Integration flow's catalog picker (stage id `'source-catalog'`).
 *
 * Presentational SINGLE-select gallery of `.choice-card--tile` tiles over the pre-built
 * integration catalog (one integration per journey — radio semantics, a re-pick switches).
 * Carries over the old catalog modal's search composition: a {@link SearchHeader} that
 * appears past the same threshold and filters across name + description.
 *
 * @module features/project-creation/ui/components/integration-flow/stages/CatalogStage
 */

import React, { useState } from 'react';
import { ChoiceCard } from '../../ChoiceCard';
import { SearchHeader } from '@/core/ui/components/navigation';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

/** Show the catalog filter only once the gallery is big enough to warrant it. */
const CATALOG_SEARCH_THRESHOLD = 5;

/** Case-insensitive match of a catalog entry's name + description against a query. */
function matchesQuery(entry: AppBuilderComponentCatalogEntry, query: string): boolean {
    return `${entry.name} ${entry.description}`.toLowerCase().includes(query);
}

export interface CatalogStageProps {
    /**
     * Genuine pre-built entries ONLY — the host narrows the mixed catalog with
     * `isPrebuiltIntegration` before passing it.
     *
     * This comment used to state the rule itself ("already filtered to
     * kind:'integration'"), which was both unenforced and wrong: the blank shell is
     * kind:'integration' too. A contract that lives in prose is one every caller can
     * assume someone else honoured — so it now names the predicate instead.
     */
    catalog: AppBuilderComponentCatalogEntry[];
    /** The draft's picked entry id (marks its tile selected). */
    selectedId?: string;
    /** Pick an entry (single-select — replaces any previous pick). */
    onPick: (id: string) => void;
}

/**
 * The catalog-picker stage body.
 *
 * @param props - the catalog, the picked id, and the pick callback
 * @returns the searchable single-select gallery
 */
export function CatalogStage({
    catalog,
    selectedId,
    onPick,
}: CatalogStageProps): React.ReactElement {
    const [query, setQuery] = useState('');
    const q = query.trim().toLowerCase();
    const filtered = q ? catalog.filter((entry) => matchesQuery(entry, q)) : catalog;
    return (
        <div className="intflow-catalog">
            <SearchHeader
                searchQuery={query}
                onSearchQueryChange={setQuery}
                totalCount={catalog.length}
                filteredCount={filtered.length}
                itemNoun="integration"
                hasLoadedOnce
                searchThreshold={CATALOG_SEARCH_THRESHOLD}
                searchPlaceholder="Filter integrations…"
            />
            {filtered.length === 0 ? (
                <div className="intflow-empty">No integrations match “{query}”.</div>
            ) : (
                <div className="intflow-choices">
                    {filtered.map((entry) => (
                        <ChoiceCard
                            key={entry.id}
                            variant="tile"
                            name={entry.name}
                            description={entry.description}
                            selected={entry.id === selectedId}
                            onSelect={() => onPick(entry.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
