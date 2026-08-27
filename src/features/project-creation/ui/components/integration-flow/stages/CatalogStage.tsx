/**
 * CatalogStage — the Add Integration flow's catalog picker (stage id `'source-catalog'`).
 *
 * Presentational SINGLE-select gallery of `.choice-card--tile` tiles over the pre-built
 * integration catalog (one integration per journey — radio semantics, a re-pick switches).
 * Carries over the old catalog modal's search composition: a {@link SearchHeader} that
 * appears past the same threshold and filters across name + description.
 *
 * NAMING: a picked entry shows the same name field the blank/custom paths use
 * (evaluate-and-emit via `evaluateInstanceName`), PREFILLED with the entry's
 * display name. The picked entry's own id is excluded from the collision
 * domain so the default name — whose slug IS that id for well-named entries —
 * evaluates valid, and Continue enables on pick exactly as before. The flow
 * commits a kept-default name as the classic catalog identity and an edited
 * name as a named instance of the entry's template repo (the seed machinery).
 *
 * @module features/project-creation/ui/components/integration-flow/stages/CatalogStage
 */

import { TextField } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { ChoiceCard } from '../../ChoiceCard';
import type { BlankInstance } from '../flowStages';
import { evaluateInstanceName } from '../instanceId';
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
    /** The collision domain (buildReservedIds); the picked entry's own id is excluded here. */
    reservedIds: Set<string>;
    /** The draft's current instance (prefills the field when returning to this stage). */
    instance?: BlankInstance;
    /** Emit the derived instance on a valid name; undefined otherwise (gates Continue). */
    onInstanceChange: (instance: BlankInstance | undefined) => void;
}

/**
 * The naming field under the gallery — the blank stage's evaluate-and-emit
 * shape, prefilled from the picked entry. A separate component so its
 * name-follows-selection state can key off the entry (`key={selectedId}`
 * remounts it on a re-pick, which is what makes the prefill re-run).
 */
function CatalogNameField({
    entry,
    reservedIds,
    instance,
    onInstanceChange,
}: {
    entry: AppBuilderComponentCatalogEntry;
    reservedIds: Set<string>;
    instance?: BlankInstance;
    onInstanceChange: (instance: BlankInstance | undefined) => void;
}): React.ReactElement {
    // The entry cannot collide with itself: keeping the default name — whose
    // slug is the entry's own id — must evaluate valid.
    const [domain] = useState(() => {
        const withoutSelf = new Set(reservedIds);
        withoutSelf.delete(entry.id);
        return withoutSelf;
    });
    const [name, setName] = useState(() => instance?.name ?? entry.name);
    const { message } = evaluateInstanceName(name, domain);
    // Emit the prefill's evaluation on mount so Continue enables on pick.
    const emittedRef = React.useRef(false);
    React.useEffect(() => {
        if (!emittedRef.current) {
            emittedRef.current = true;
            if (!instance) {
                onInstanceChange(evaluateInstanceName(entry.name, domain).instance);
            }
        }
    }, [instance, entry.name, domain, onInstanceChange]);
    const handleChange = (next: string): void => {
        setName(next);
        onInstanceChange(evaluateInstanceName(next, domain).instance);
    };
    return (
        <TextField
            label="Integration name"
            value={name}
            onChange={handleChange}
            validationState={message ? 'invalid' : undefined}
            errorMessage={message}
            width="100%"
        />
    );
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
    reservedIds,
    instance,
    onInstanceChange,
}: CatalogStageProps): React.ReactElement {
    const [query, setQuery] = useState('');
    const q = query.trim().toLowerCase();
    const filtered = q ? catalog.filter((entry) => matchesQuery(entry, q)) : catalog;
    const selectedEntry = catalog.find((entry) => entry.id === selectedId);
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
                            // Disclose tool cost BEFORE the choice binds: the add
                            // door auto-installs the declared Node via fnm, and a
                            // one-time ~30s install should never be a surprise.
                            description={
                                entry.nodeVersion
                                    ? `${entry.description} Installs Node ${entry.nodeVersion} on first use.`
                                    : entry.description
                            }
                            selected={entry.id === selectedId}
                            onSelect={() => onPick(entry.id)}
                        />
                    ))}
                </div>
            )}
            {selectedEntry ? (
                <CatalogNameField
                    key={selectedEntry.id}
                    entry={selectedEntry}
                    reservedIds={reservedIds}
                    instance={instance}
                    onInstanceChange={onInstanceChange}
                />
            ) : null}
        </div>
    );
}
