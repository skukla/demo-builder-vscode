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
 * modal's groups and the API picker use it. The ERP "Assign products" list is a searchable table of
 * products; a few dozen stores in their tree needs neither.
 *
 * @module features/data-installer/ui/components/StorePickList
 */

import React from 'react';
import { tickOf, toggleStore, toggleWebsite, viewsLine, websiteTicks } from '../clearDemoDataWords';
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

/** Every website and its stores, ticked as `ticks` says. */
export function StorePickList({ choices, ticks, onChange, isDisabled }: StorePickListProps): React.ReactElement {
    return (
        <div className="clear-demo-store-list" data-testid="clear-demo-store-list">
            {choices.map((site) => (
                <WebsiteRows key={site.code} site={site} ticks={ticks} onChange={onChange} isDisabled={isDisabled} />
            ))}
        </div>
    );
}
