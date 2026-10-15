/**
 * CatalogStage — the Add Integration flow's catalog picker (stage id `'source-catalog'`).
 *
 * Presentational SINGLE-select gallery of `.choice-card--tile` tiles over the pre-built
 * integration catalog (one integration per journey — radio semantics, a re-pick switches).
 * Carries over the old catalog modal's search composition: a {@link SearchHeader} that
 * appears past the same threshold and filters across name + description.
 *
 * NAMING: a picked entry shows the shared {@link OptionalNameField} — empty
 * means "use the entry's name", and nothing gates Continue on it (identity is
 * minted at commit with silent dedupe). A kept default still commits the
 * classic catalog identity; a typed name commits a named instance of the
 * entry's template repo (the seed machinery).
 *
 * @module features/project-creation/ui/components/integration-flow/stages/CatalogStage
 */

import React, { useState } from 'react';
import { ChoiceCard } from '../../ChoiceCard';
import { OptionalNameField } from '../OptionalNameField';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { DEFAULT_PAIR_BASE, pairedSystemOf, systemWordOf } from '@/features/app-builder/services/pairNames';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

/**
 * Said under the name before a pre-built integration is added. Until the project
 * is created the wizard can still change it (the card's pencil, or Settings for
 * the ERP); once deployed it is fixed.
 */
export const NAME_IS_FIXED = "Can't be renamed once deployed.";

/**
 * What the name field is. For an entry that brings a system, the field names the
 * SYSTEM ("ERP name", "Acme ERP"); the integration keeps its catalog name
 * (`pairNames`).
 */
function nameField(entry: AppBuilderComponentCatalogEntry | undefined): { fieldLabel?: string; defaultLabel: string } {
    const system = entry && pairedSystemOf(entry, getAppBuilderComponentCatalog());
    if (!system) return { defaultLabel: entry?.name ?? '' };
    const word = systemWordOf(system);
    return { fieldLabel: `${word} name (optional)`, defaultLabel: `${DEFAULT_PAIR_BASE} ${word}` };
}

/** Stable empty id list (avoids a new array each render). */
const NO_IDS: readonly string[] = [];

/** Show the catalog filter only once the gallery is big enough to warrant it. */
const CATALOG_SEARCH_THRESHOLD = 5;

/** Case-insensitive match of a catalog entry's name + description against a query. */
function matchesQuery(entry: AppBuilderComponentCatalogEntry, query: string): boolean {
    return `${entry.name} ${entry.description}`.toLowerCase().includes(query);
}

/**
 * Entries that cannot be added here, and what to tell the SC instead — the ERP
 * integration when another project already runs one on this Commerce instance (AB-78).
 */
export interface UnavailableEntries {
    /** Why, and what to do instead: the banner above the gallery. */
    message: string;
    /** The entries' ids; their tiles stay in the gallery, greyed out. */
    ids: readonly string[];
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
    /**
     * Entries that cannot be added here: their tiles stay in the gallery, greyed out
     * like the API Mesh tile once a project has its mesh, under a banner saying why
     * and what to do instead. The banner, not the tile, carries the words: a note on
     * a greyed tile is the easiest thing on the screen to miss (owner, 2026-10-15).
     */
    unavailable?: UnavailableEntries;
    /** The draft's picked entry id (marks its tile selected). */
    selectedId?: string;
    /** Pick an entry (single-select — replaces any previous pick). */
    onPick: (id: string) => void;
    /** The draft's raw typed label ('' / undefined = the entry's name). */
    label?: string;
    /** Report label keystrokes. */
    onLabelChange: (label: string) => void;
}

/**
 * The catalog-picker stage body.
 *
 * @param props - the catalog, the picked id, and the pick callback
 * @returns the searchable single-select gallery
 */
export function CatalogStage({
    catalog,
    unavailable,
    selectedId,
    onPick,
    label,
    onLabelChange,
}: CatalogStageProps): React.ReactElement {
    const [query, setQuery] = useState('');
    const q = query.trim().toLowerCase();
    const filtered = q ? catalog.filter((entry) => matchesQuery(entry, q)) : catalog;
    const selectedEntry = catalog.find((entry) => entry.id === selectedId);
    const naming = nameField(selectedEntry);
    const greyedIds = unavailable?.ids ?? NO_IDS;
    const greyed = catalog.filter((entry) => greyedIds.includes(entry.id));
    // Nothing to pick means nothing to name: the field would only ever say "Pick an
    // integration first".
    const nothingPickable = catalog.length > 0 && greyed.length === catalog.length;
    return (
        <div className="intflow-catalog">
            {unavailable && greyed.length > 0 && (
                <InlineNotice title={unavailable.message} testId="catalog-unavailable" />
            )}
            <SearchHeader
                searchQuery={query}
                onSearchQueryChange={setQuery}
                totalCount={catalog.length}
                filteredCount={filtered.length}
                itemNoun="integration"
                hasLoadedOnce
                searchThreshold={CATALOG_SEARCH_THRESHOLD}
                searchPlaceholder="Filter integrations"
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
                            disabled={greyedIds.includes(entry.id)}
                            // Disclose tool cost BEFORE the choice binds: the add
                            // door auto-installs the declared Node via fnm, and a
                            // one-time ~30s install should never be a surprise. A
                            // note rather than part of the description, which the
                            // tile clips.
                            note={entry.nodeVersion ? `Installs Node ${entry.nodeVersion} on first use.` : undefined}
                            selected={entry.id === selectedId}
                            onSelect={() => onPick(entry.id)}
                        />
                    ))}
                </div>
            )}
            {/* On screen, disabled until a pick: appearing on the pick made the whole
                dialog grow under the SC's cursor (owner, 2026-09-21). Absent only
                when no tile can be picked at all. */}
            {!nothingPickable && (
                <OptionalNameField
                    label={label}
                    fieldLabel={naming.fieldLabel}
                    defaultLabel={naming.defaultLabel}
                    onLabelChange={onLabelChange}
                    disabledHint={selectedEntry ? undefined : 'Pick an integration first'}
                    // A pre-built integration's name is fixed once it is deployed (owner,
                    // 2026-09-25): say so before the name is committed, not after.
                    description={NAME_IS_FIXED}
                />
            )}
        </div>
    );
}
