/**
 * What SearchableList hands DOWN, which is most of what it decides.
 *
 * The three sibling suites read the rendered list, and that is the wrong end
 * for four of this component's five decisions: the search header's autofocus
 * rule, the row's `textValue`, the scroll hook's arguments and the refresh
 * state all leave through a collaborator's props. Two of them (`autoFocus`,
 * `textValue`) are stripped before they reach the DOM by the shared Spectrum
 * mock, so reading the markup could never have seen them — every mutation of
 * the autofocus rule survived a suite that renders the search box.
 *
 * So this suite asserts the ARGUMENTS the collaborators receive: a mock cannot
 * see a malformed call, but it can record one.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

/** Props the search header was handed, newest last. */
const headerProps: Record<string, unknown>[] = [];
jest.mock('@/core/ui/components/navigation/SearchHeader', () => ({
    SearchHeader: (props: Record<string, unknown>) => {
        headerProps.push(props);
        return <div data-testid="search-header" />;
    },
}));

/** Arguments the scroll hook was handed, newest last. */
const scrollArgs: Record<string, unknown>[] = [];
jest.mock('@/core/ui/components/navigation/useScrollToSelectedRow', () => ({
    useScrollToSelectedRow: (args: Record<string, unknown>) => {
        scrollArgs.push(args);
    },
}));

// The shared Spectrum mock drops `textValue` before it reaches the DOM (it is
// on the not-a-DOM-prop list, correctly). Only `Item` is replaced, so the row
// can be asked what it was given; everything else stays as the other suites see it.
jest.mock('@adobe/react-spectrum', () => ({
    ...jest.requireActual('@adobe/react-spectrum'),
    Item: ({ textValue, children }: { textValue?: string; children?: React.ReactNode }) => (
        <div data-testid="row" data-text-value={String(textValue)}>
            {children}
        </div>
    ),
}));

import { SearchableList } from '@/core/ui/components/navigation/SearchableList';
import { defaultProps, mockItems, type TestItem } from './SearchableList.testUtils';

beforeEach(() => {
    headerProps.length = 0;
    scrollArgs.length = 0;
});

describe('the search header it builds', () => {
    it('autofocuses the search when there is nothing selected to look at', () => {
        render(<SearchableList {...defaultProps} autoFocus />);

        expect(headerProps[0].autoFocus).toBe(true);
    });

    it('does NOT autofocus when a row is already selected', () => {
        // Stealing focus to the filter would scroll the chosen row out of view,
        // which is the one thing the person came back to see.
        render(<SearchableList {...defaultProps} autoFocus selectedKeys={['2']} />);

        expect(headerProps[0].autoFocus).toBe(false);
    });

    it('does not autofocus unless asked, even with no selection', () => {
        render(<SearchableList {...defaultProps} />);

        expect(headerProps[0].autoFocus).toBe(false);
    });

    it('offers a placeholder that says what the field does', () => {
        render(<SearchableList {...defaultProps} />);

        expect(headerProps[0].searchPlaceholder).toBe('Type to filter...');
    });
});

describe('the row it builds', () => {
    it('gives the row a text value, which is what typeahead matches on', () => {
        render(<SearchableList {...defaultProps} filteredItems={[mockItems[0]]} />);

        expect(screen.getByTestId('row')).toHaveAttribute('data-text-value', 'Project Alpha');
    });

    it('falls back to the name when an item carries no title', () => {
        // Adobe orgs arrive with `name`; projects and workspaces with `title`.
        const named = [{ id: '9', name: 'Named Only' }] as TestItem[];

        render(<SearchableList {...defaultProps} items={named} filteredItems={named} />);

        expect(screen.getByTestId('row')).toHaveAttribute('data-text-value', 'Named Only');
    });

    it('puts the description in the description slot, not loose in the row', () => {
        render(<SearchableList {...defaultProps} filteredItems={[mockItems[0]]} />);

        expect(screen.getByText('First project')).toHaveAttribute('data-slot', 'description');
    });

    it('renders no description slot for an item without one', () => {
        const bare = [{ id: '9', title: 'No Description' }] as TestItem[];

        render(<SearchableList {...defaultProps} items={bare} filteredItems={bare} />);

        expect(document.querySelector('[data-slot="description"]')).toBeNull();
    });
});

describe('what the scroll hook is told', () => {
    it('names the selected row and WHERE it sits, which is what centring needs', () => {
        render(<SearchableList {...defaultProps} selectedKeys={['3']} />);

        expect(scrollArgs[0]).toMatchObject({
            selectedId: '3',
            selectedIndex: 2,
            hasItems: true,
        });
        expect(scrollArgs[0].containerRef).toEqual({ current: expect.anything() });
    });

    it('reports no row and no items when the filter empties the list', () => {
        render(<SearchableList {...defaultProps} filteredItems={[]} />);

        expect(scrollArgs[0]).toMatchObject({
            selectedId: undefined,
            selectedIndex: -1,
            hasItems: false,
        });
    });

    it('reports index -1 when the selected row is not in the filtered list', () => {
        // Selecting a row and then filtering it away must not centre row 0.
        render(
            <SearchableList
                {...defaultProps}
                selectedKeys={['4']}
                filteredItems={mockItems.slice(0, 2)}
            />
        );

        expect(scrollArgs[0]).toMatchObject({ selectedId: '4', selectedIndex: -1, hasItems: true });
    });
});

describe('the refreshing state', () => {
    const listContainer = () => document.querySelector('.list-refresh-container');

    it('dims the list while a refresh is in flight', () => {
        render(<SearchableList {...defaultProps} isRefreshing />);

        expect(listContainer()).toHaveClass('refreshing');
    });

    it('does not dim it by default', () => {
        render(<SearchableList {...defaultProps} />);

        expect(listContainer()).not.toHaveClass('refreshing');
    });
});

describe('the no-results line', () => {
    const noResults = () => screen.queryByText(/match/);

    it('appears only when a search emptied the list', () => {
        render(<SearchableList {...defaultProps} searchQuery="nope" filteredItems={[]} />);

        expect(screen.getByText('No items match "nope"')).toBeInTheDocument();
    });

    it('stays away when a search DID find something', () => {
        render(<SearchableList {...defaultProps} searchQuery="Project" />);

        expect(noResults()).not.toBeInTheDocument();
    });

    it('stays away for an empty list nobody searched — that is a loading state', () => {
        render(<SearchableList {...defaultProps} filteredItems={[]} />);

        expect(noResults()).not.toBeInTheDocument();
    });
});
