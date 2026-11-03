/**
 * The stores "Clear demo data" can clear, as the instance's own website / store / store view tree:
 * one row per website, its stores under it, each store's views named on its row (never picked on
 * their own). Ticking a website ticks every store of it; a store another local project records as
 * its own is locked, with the sentence naming that project.
 *
 * The tree is the one the Business Structure step chooses from: the same three lists
 * (`store/websites`, `store/storeGroups`, `store/storeViews`, the `CommerceStoreStructure` that
 * `storeScopeOf` and store discovery read), shaped by the extension (`choicesOf`) and handed over in
 * `check-demo-data`'s answer. Its pickers (`StoreSelectionRow` / `useStoreDiscovery`) were not reused:
 * they choose ONE website, store and view, and fetch through the wizard's discovery with form
 * credentials, where this picks several stores of a project already made. The rows are the house
 * `CheckboxRow` (a website's row shows some-but-not-all with its `isIndeterminate`), as the Updates
 * modal's groups and the API picker use it.
 *
 * It has the house filter, as every list whose length depends on the store does (owner, 2026-11-03).
 * A store that matches keeps its website showing above it, and a website that matches shows all its
 * stores, since ticking a website ticks every one of them whatever the filter shows.
 *
 * @module features/data-installer/ui/components/StorePickList
 */

import React, { useMemo, useState } from 'react';
import { tickOf, toggleStore, toggleWebsite, viewsLine, websiteTicks } from '../clearDemoDataWords';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';
import type { WipeChoiceWebsite } from '@/types/demoDataWipe';

export interface StorePickListProps {
    choices: WipeChoiceWebsite[];
    ticks: ReadonlySet<string>;
    onChange: (ticks: Set<string>) => void;
    isDisabled?: boolean;
}

function WebsiteRows({ site, ticks, onChange, isDisabled }: Omit<StorePickListProps, 'choices'> & { site: WipeChoiceWebsite }) {
    const state = websiteTicks(site, ticks);
    return (
        <div>
            <CheckboxRow
                label={site.name}
                detail={site.code}
                isSelected={state.all}
                isIndeterminate={state.some}
                isDisabled={isDisabled || state.open.length === 0}
                onChange={() => onChange(toggleWebsite(site, ticks))}
            />
            <div className="clear-demo-stores">
                {site.stores.map((store) => {
                    const tick = tickOf(site.code, store.code);
                    return (
                        <CheckboxRow
                            key={store.code}
                            label={store.name}
                            detail={`${store.code}. ${viewsLine(store.views)}`}
                            reason={store.claimedBy}
                            isSelected={ticks.has(tick) && !store.claimedBy}
                            isDisabled={isDisabled || Boolean(store.claimedBy)}
                            onChange={() => onChange(toggleStore(tick, ticks))}
                        />
                    );
                })}
            </div>
        </div>
    );
}

/** The websites a query leaves: one that matches keeps every store, otherwise only the stores that match. */
function filterChoices(choices: WipeChoiceWebsite[], query: string): WipeChoiceWebsite[] {
    const q = query.trim().toLowerCase();
    if (!q) return choices;
    const hit = (...values: string[]): boolean => values.some((value) => value.toLowerCase().includes(q));
    return choices.flatMap((site) => {
        if (hit(site.name, site.code)) return [site];
        const stores = site.stores.filter((store) => hit(store.name, store.code));
        return stores.length > 0 ? [{ ...site, stores }] : [];
    });
}

const storeCount = (choices: WipeChoiceWebsite[]): number => choices.reduce((sum, site) => sum + site.stores.length, 0);

/** Every website and its stores, filterable, ticked as `ticks` says. */
export function StorePickList({ choices, ticks, onChange, isDisabled }: StorePickListProps): React.ReactElement {
    const [query, setQuery] = useState('');
    const shown = useMemo(() => filterChoices(choices, query), [choices, query]);
    return (
        <>
            <SearchHeader
                searchQuery={query}
                onSearchQueryChange={setQuery}
                searchPlaceholder="Filter stores"
                totalCount={storeCount(choices)}
                filteredCount={storeCount(shown)}
                itemNoun="store"
                hasLoadedOnce
                hideCount
            />
            <div className="clear-demo-store-list" data-testid="clear-demo-store-list">
                {shown.map((site) => (
                    <WebsiteRows key={site.code} site={site} ticks={ticks} onChange={onChange} isDisabled={isDisabled} />
                ))}
                {shown.length === 0 ? <p className="datapack-export-note">No stores match “{query}”.</p> : null}
            </div>
        </>
    );
}
