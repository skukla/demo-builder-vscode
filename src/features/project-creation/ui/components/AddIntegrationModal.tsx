/**
 * AddIntegrationModal — the Integration Catalog picker, in a MODAL.
 *
 * Opened by the "Integration Catalog" row's Add on the Integrations "Services" screen (and by
 * an added catalog card's "Change"). A large, growing library warrants its own surface rather
 * than an inline expansion, so browsing lives here. Custom (GitHub-URL) integrations are light
 * and add INLINE via their own row ({@link CustomIntegrationRow}) — not here.
 *
 * The body is a TOGGLE-SELECT gallery — one `.choice-card--tile` per catalog entry. Clicking a
 * tile toggles it via `onToggleCatalog(id, next)` (the ✓ marks selection) and the modal STAYS
 * OPEN so several can be picked; the "Done" footer closes it (= added). It writes WIZARD STATE
 * via the callback — it does NOT postMessage; deploy is deferred to project creation.
 *
 * @module features/project-creation/ui/components/AddIntegrationModal
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { ChoiceCard } from './ChoiceCard';
import { SearchHeader } from '@/core/ui/components/navigation';
import { Modal } from '@/core/ui/components/ui/Modal';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

/** Show the catalog filter only once the gallery is big enough to warrant it. */
const CATALOG_SEARCH_THRESHOLD = 5;

/** Case-insensitive match of a catalog entry's name + description against a query. */
function matchesQuery(entry: AppBuilderComponentCatalogEntry, query: string): boolean {
    return `${entry.name} ${entry.description}`.toLowerCase().includes(query);
}

export interface AddIntegrationModalProps {
    /** Whether the modal is open. */
    isOpen: boolean;
    /** Close the modal (the user's dismiss / Done). */
    onClose: () => void;
    /** Pre-built catalog entries, already filtered to `kind:'integration'`. */
    catalog: AppBuilderComponentCatalogEntry[];
    /** Ids already selected (marks their catalog tiles ✓). */
    selectedIds: string[];
    /** Toggle a pre-built catalog integration by id (`next` = select/deselect). */
    onToggleCatalog: (id: string, next: boolean) => void;
}

/**
 * The catalog body: a TOGGLE-SELECT gallery of `.choice-card--tile` tiles that STAYS OPEN.
 * Clicking a tile toggles its selection (the ✓ conveys state); the modal's "Done" footer
 * closes it (= added).
 */
function CatalogBody({
    catalog,
    selectedIds,
    onToggle,
}: {
    catalog: AppBuilderComponentCatalogEntry[];
    selectedIds: string[];
    onToggle: (id: string, next: boolean) => void;
}): React.ReactElement {
    const [query, setQuery] = useState('');
    const q = query.trim().toLowerCase();
    const filtered = q ? catalog.filter((entry) => matchesQuery(entry, q)) : catalog;
    return (
        <>
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
                <div className="int-add-empty">No integrations match “{query}”.</div>
            ) : (
                <div className="int-add-choices">
                    {filtered.map((componentEntry) => {
                        const isSelected = selectedIds.includes(componentEntry.id);
                        return (
                            <ChoiceCard
                                key={componentEntry.id}
                                variant="tile"
                                name={componentEntry.name}
                                description={componentEntry.description}
                                selected={isSelected}
                                onSelect={() => onToggle(componentEntry.id, !isSelected)}
                            />
                        );
                    })}
                </div>
            )}
        </>
    );
}

/**
 * The Integration Catalog modal: a `DialogContainer`-hosted {@link Modal} whose body is the
 * toggle-select catalog gallery.
 *
 * @param props - open state, the catalog, current selection, and the toggle callback
 * @returns the modal host (renders the dialog only while open)
 */
export function AddIntegrationModal({
    isOpen,
    onClose,
    catalog,
    selectedIds,
    onToggleCatalog,
}: AddIntegrationModalProps): React.ReactElement {
    return (
        <DialogContainer type="fullscreen" onDismiss={onClose}>
            {isOpen && (
                <Modal
                    title="Integration Catalog"
                    size="L"
                    onClose={onClose}
                    closeLabel="Done"
                    closeVariant="accent"
                >
                    <CatalogBody
                        catalog={catalog}
                        selectedIds={selectedIds}
                        onToggle={onToggleCatalog}
                    />
                </Modal>
            )}
        </DialogContainer>
    );
}
