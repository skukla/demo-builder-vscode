/**
 * The render harness both SelectionStepContent suites use.
 *
 * The component has four states of its own — loading, error, empty, and the
 * loaded list — and everything inside that last one (search field, counts,
 * refresh, no-results) belongs to `SearchableList`, which has 27 tests of its
 * own. So these suites cover the four states and the disabled-item rules, and
 * nothing else.
 */

import { render } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import React from 'react';
import { SelectionStepContent } from '@/core/ui/components/selection/SelectionStepContent';
import type { SelectableItem } from '@/core/ui/components/selection/SelectionStepContent';

export interface OrgItem extends SelectableItem {
    id: string;
    name: string;
}

export const items: OrgItem[] = [
    { id: 'o1', name: 'Selectable Org' },
    { id: 'o2', name: 'Filtered Org' },
];

export const baseLabels = {
    heading: '',
    loadingMessage: 'Loading organizations...',
    errorTitle: 'Error Loading Organizations',
    emptyTitle: 'No Organizations',
    emptyMessage: 'No organizations found.',
    searchPlaceholder: 'Type to filter organizations...',
    itemNoun: 'organization',
    ariaLabel: 'Adobe Organizations',
};

/** Render the component in its loaded state, with `extra` overriding any prop. */
export function renderContent(extra: Record<string, unknown> = {}) {
    return render(
        <Provider theme={defaultTheme}>
            <SelectionStepContent
                items={items}
                filteredItems={items}
                showLoading={false}
                isLoading={false}
                isRefreshing={false}
                hasLoadedOnce={true}
                error={null}
                searchQuery=""
                onSearchChange={jest.fn()}
                onLoad={jest.fn()}
                onRefresh={jest.fn()}
                selectedId={undefined}
                onSelect={jest.fn()}
                labels={baseLabels}
                {...extra}
            />
        </Provider>
    );
}
