import { render, screen } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import React from 'react';
import { SelectionStepContent, type SelectableItem } from '@/core/ui/components/selection';
import '@testing-library/jest-dom';

interface OrgItem extends SelectableItem {
    id: string;
    name: string;
}

const items: OrgItem[] = [
    { id: 'o1', name: 'Selectable Org' },
    { id: 'o2', name: 'Filtered Org' },
];

const baseLabels = {
    heading: '',
    loadingMessage: 'Loading organizations...',
    errorTitle: 'Error Loading Organizations',
    emptyTitle: 'No Organizations',
    emptyMessage: 'No organizations found.',
    searchPlaceholder: 'Type to filter organizations...',
    itemNoun: 'organization',
    ariaLabel: 'Adobe Organizations',
};

function renderContent(extra: Record<string, unknown>) {
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
        </Provider>,
    );
}

describe('SelectionStepContent - disabled items', () => {
    it('renders all items when no disabledIds are provided (back-compat)', () => {
        renderContent({});
        expect(screen.getByText('Selectable Org')).toBeInTheDocument();
        expect(screen.getByText('Filtered Org')).toBeInTheDocument();
    });

    it('renders the disabled reason next to a non-selectable item', () => {
        renderContent({
            disabledIds: ['o2'],
            disabledReasons: { o2: 'Sign in with a different account.' },
        });
        expect(screen.getByText('Sign in with a different account.')).toBeInTheDocument();
    });

    it('does not render a reason for items that are not disabled', () => {
        renderContent({
            disabledIds: ['o2'],
            disabledReasons: { o2: 'Sign in with a different account.' },
        });
        // The selectable org has no reason text under it.
        expect(screen.queryByText('Selectable Org')).toBeInTheDocument();
        expect(screen.queryAllByText('Sign in with a different account.')).toHaveLength(1);
    });
});
