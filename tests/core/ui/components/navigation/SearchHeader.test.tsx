import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';

// Wrap component with Spectrum Provider
const renderWithProvider = (ui: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme} colorScheme="light">
            {ui}
        </Provider>
    );
};

describe('SearchHeader', () => {
    const defaultProps = {
        searchQuery: '',
        onSearchQueryChange: jest.fn(),
        totalCount: 10,
        filteredCount: 10,
        hasLoadedOnce: true,
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // A dialog cuts a count of what the SC can see (dialog design rules). The buttons have to stay.
    describe('hideCount', () => {
        it('says no count, and keeps the row its buttons live on when there is no search field', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    totalCount={2}
                    filteredCount={2}
                    itemNoun="project"
                    alwaysShowCount
                    hideCount
                    action={<button type="button">New</button>}
                />
            );

            expect(screen.queryByText(/2 projects/)).toBeNull();
            expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
        });

        it('draws no empty row under a search field, and no count while filtering', () => {
            const { container } = renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    searchQuery="a"
                    filteredCount={3}
                    itemNoun="project"
                    alwaysShowCount
                    hideCount
                />
            );

            expect(container.querySelector('.search-header-count-row')).toBeNull();
            expect(screen.queryByText(/3 of 10/)).toBeNull();
        });

        it('CONTROL: without it the count is there', () => {
            renderWithProvider(<SearchHeader {...defaultProps} totalCount={2} filteredCount={2} itemNoun="project" alwaysShowCount />);

            expect(screen.getByText('2 projects')).toBeInTheDocument();
        });
    });

    describe('search field visibility', () => {
        it('should show search field on a short list', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    totalCount={1}
                    filteredCount={1}
                />
            );

            expect(screen.getByPlaceholderText(/type to filter/i)).toBeInTheDocument();
        });

        it('should hide search field when there is nothing to filter', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    totalCount={0}
                    filteredCount={0}
                />
            );

            expect(screen.queryByPlaceholderText(/type to filter/i)).not.toBeInTheDocument();
        });

        it('should use custom placeholder text', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    totalCount={10}
                    searchPlaceholder="Filter projects"
                />
            );

            expect(screen.getByPlaceholderText(/filter projects/i)).toBeInTheDocument();
        });

        it('should call onSearchQueryChange when typing', () => {
            const onSearchQueryChange = jest.fn();
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    totalCount={10}
                    onSearchQueryChange={onSearchQueryChange}
                />
            );

            const searchField = screen.getByPlaceholderText(/type to filter/i);
            fireEvent.change(searchField, { target: { value: 'test' } });

            expect(onSearchQueryChange).toHaveBeenCalledWith('test');
        });
    });

    describe('count display', () => {
        it('should show count when hasLoadedOnce is true', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    totalCount={10}
                    hasLoadedOnce={true}
                    alwaysShowCount={true}
                />
            );

            expect(screen.getByText('10 items')).toBeInTheDocument();
        });

        it('should hide count when hasLoadedOnce is false', () => {
            renderWithProvider(
                <SearchHeader {...defaultProps} totalCount={10} hasLoadedOnce={false} />
            );

            expect(screen.queryByText(/items/i)).not.toBeInTheDocument();
        });

        it('should show filtered count when filtering', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    searchQuery="test"
                    totalCount={10}
                    filteredCount={3}
                    alwaysShowCount={true}
                />
            );

            expect(screen.getByText('3 of 10 items')).toBeInTheDocument();
        });

        it('should use singular noun when count is 1', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    totalCount={1}
                    filteredCount={1}
                    alwaysShowCount={true}
                />
            );

            expect(screen.getByText('1 item')).toBeInTheDocument();
        });

        it('should use custom itemNoun', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    totalCount={5}
                    filteredCount={5}
                    itemNoun="project"
                    alwaysShowCount={true}
                />
            );

            expect(screen.getByText('5 projects')).toBeInTheDocument();
        });
    });

    describe('refresh button', () => {
        it('should show refresh button when onRefresh is provided', () => {
            renderWithProvider(<SearchHeader {...defaultProps} onRefresh={jest.fn()} />);

            expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
        });

        it('should hide refresh button when onRefresh is not provided', () => {
            renderWithProvider(<SearchHeader {...defaultProps} />);

            expect(screen.queryByRole('button', { name: /refresh/i })).not.toBeInTheDocument();
        });

        it('should call onRefresh when button is clicked', () => {
            const onRefresh = jest.fn();
            renderWithProvider(<SearchHeader {...defaultProps} onRefresh={onRefresh} />);

            fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

            expect(onRefresh).toHaveBeenCalledTimes(1);
        });

        it('should be disabled when isRefreshing is true', () => {
            renderWithProvider(
                <SearchHeader {...defaultProps} onRefresh={jest.fn()} isRefreshing={true} />
            );

            expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled();
        });

        it('should use custom refresh aria label', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    onRefresh={jest.fn()}
                    refreshAriaLabel="Reload projects"
                />
            );

            expect(screen.getByRole('button', { name: /reload projects/i })).toBeInTheDocument();
        });
    });

    describe('alwaysShowCount', () => {
        it('should show count even with 0 items when alwaysShowCount is true', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    totalCount={0}
                    filteredCount={0}
                    hasLoadedOnce={true}
                    alwaysShowCount={true}
                />
            );

            expect(screen.getByText('0 items')).toBeInTheDocument();
        });

        it('should hide count when 0 items and alwaysShowCount is false', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    totalCount={0}
                    filteredCount={0}
                    hasLoadedOnce={true}
                    alwaysShowCount={false}
                />
            );

            expect(screen.queryByText(/items/i)).not.toBeInTheDocument();
        });
    });

    /**
     * `countTrailing` — the end of the count row.
     *
     * That row is `justify-content: space-between` with the count on the left and,
     * when there is no search field, the action buttons on the right. With a field
     * showing, the right half is empty width on every screen using this component.
     *
     * The integrations band needed somewhere for its "Deploys to …" context that
     * was neither the page header (where the LOCAL project name and the REMOTE
     * Adobe destination were indistinguishable) nor a row of its own (which spent
     * a line on the least-used fact on the screen). This is that space.
     */
    describe('the count, without alwaysShowCount', () => {
        // Every other count test passes alwaysShowCount={true}, which makes the
        // `totalCount > 0` half of the decision unreachable — so neither the
        // default nor the item-count test was pinned by anything.
        it('shows the count for a non-empty list when alwaysShowCount is omitted', () => {
            renderWithProvider(
                <SearchHeader {...defaultProps} totalCount={10} filteredCount={10} />
            );

            expect(screen.getByText('10 items')).toBeInTheDocument();
        });

        it('hides the count for an empty list when alwaysShowCount is omitted', () => {
            renderWithProvider(<SearchHeader {...defaultProps} totalCount={0} filteredCount={0} />);

            expect(screen.queryByText(/items/i)).not.toBeInTheDocument();
        });
    });

    /**
     * `countText` replaces the built count line for a list holding more than
     * one kind of thing — and only while nothing is filtered, where "Showing N
     * of M" is the answer whatever the kinds are.
     */
    describe('countText', () => {
        it('replaces the built count line when nothing is filtered', () => {
            renderWithProvider(
                <SearchHeader {...defaultProps} countText="1 integration, 1 system" />
            );

            expect(screen.getByText('1 integration, 1 system')).toBeInTheDocument();
            expect(screen.queryByText('10 items')).not.toBeInTheDocument();
        });

        it('gives way to the filtered count while filtering', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    searchQuery="erp"
                    filteredCount={3}
                    countText="1 integration, 1 system"
                />
            );

            expect(screen.getByText('3 of 10 items')).toBeInTheDocument();
            expect(screen.queryByText('1 integration, 1 system')).not.toBeInTheDocument();
        });
    });

    describe('the search field label', () => {
        it('names what is being filtered, from the plural noun', () => {
            renderWithProvider(<SearchHeader {...defaultProps} itemNoun="project" />);

            expect(screen.getByLabelText('Filter projects')).toBeInTheDocument();
        });
    });

    describe('what counts as filtering', () => {
        it('treats a whitespace-only query as no filter', () => {
            // Without the trim, spaces alone flip the count line to "X of Y"
            // while every item is still listed.
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    searchQuery="   "
                    totalCount={10}
                    filteredCount={10}
                    alwaysShowCount={true}
                />
            );

            expect(screen.getByText('10 items')).toBeInTheDocument();
            expect(screen.queryByText('10 of 10 items')).not.toBeInTheDocument();
        });
    });

    describe('typing in the filter moves nothing (owner, 2026-10-31)', () => {
        // "Showing 1 of 12 datapacks" took room from the Data Installer's buttons and cut
        // their labels. The count now holds the width of its longest form from the start.
        it('holds the longest count while unfiltered, and the same while filtered', () => {
            const props = { ...defaultProps, totalCount: 12, itemNoun: 'datapack', alwaysShowCount: true };
            const { container, rerender } = renderWithProvider(
                <SearchHeader {...props} searchQuery="" filteredCount={12} />
            );
            const held = () => container.querySelector('.search-header-count')?.getAttribute('data-longest');
            expect(held()).toBe('12 of 12 datapacks');

            rerender(
                <Provider theme={defaultTheme} colorScheme="light">
                    <SearchHeader {...props} searchQuery="zz" filteredCount={1} />
                </Provider>
            );

            expect(screen.getByText('1 of 12 datapacks')).toBeInTheDocument();
            expect(held()).toBe('12 of 12 datapacks');
        });

        it('holds a longer custom count line when there is one', () => {
            const { container } = renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    totalCount={2}
                    filteredCount={2}
                    alwaysShowCount
                    countText="1 integration, 1 system"
                />
            );
            expect(container.querySelector('.search-header-count')?.getAttribute('data-longest')).toBe(
                '1 integration, 1 system'
            );
        });
    });

    describe('where the action buttons live', () => {
        // showSearch decides the header's SHAPE: with a search field the buttons
        // sit in the search row, without one they move down beside the count.
        it('puts the refresh button on the count row when the list is empty', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    totalCount={0}
                    filteredCount={0}
                    onRefresh={jest.fn()}
                    alwaysShowCount={true}
                />
            );

            expect(screen.queryByPlaceholderText(/type to filter/i)).not.toBeInTheDocument();
            expect(screen.getByLabelText('Refresh list')).toBeInTheDocument();
        });

        it('shows the refresh button exactly once when the search field is present', () => {
            // The buttons move rows; they must not appear on both.
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    totalCount={10}
                    filteredCount={10}
                    onRefresh={jest.fn()}
                    alwaysShowCount={true}
                />
            );

            expect(screen.getAllByLabelText('Refresh list')).toHaveLength(1);
        });
    });

    // A list in selection mode says what is selected where the count was (the projects list).
    describe('countLead', () => {
        it("takes the count's place at the row's start, filtering or not", () => {
            const { container } = render(
                <SearchHeader
                    searchQuery="a"
                    onSearchQueryChange={jest.fn()}
                    totalCount={10}
                    filteredCount={3}
                    itemNoun="project"
                    hasLoadedOnce
                    alwaysShowCount
                    countLead={<span data-testid="lead">1 of 3 selected</span>}
                    countTrailing={<span data-testid="trailing">Done</span>}
                />
            );

            expect(screen.queryByText('3 of 10 projects')).toBeNull();
            const row = container.querySelector('.search-header-count-row');
            expect(row?.firstElementChild).toBe(screen.getByTestId('lead'));
            expect(screen.getByTestId('trailing')).toBeInTheDocument();
        });

        it('leaves the count alone when absent — control', () => {
            render(
                <SearchHeader
                    searchQuery="a"
                    onSearchQueryChange={jest.fn()}
                    totalCount={10}
                    filteredCount={3}
                    itemNoun="project"
                    hasLoadedOnce
                    alwaysShowCount
                />
            );

            expect(screen.getByText('3 of 10 projects')).toBeInTheDocument();
        });
    });

    describe('countTrailing', () => {
        it('renders at the end of the count row', () => {
            render(
                <SearchHeader
                    searchQuery=""
                    onSearchQueryChange={jest.fn()}
                    totalCount={2}
                    filteredCount={2}
                    hasLoadedOnce
                    alwaysShowCount
                    countTrailing={<span data-testid="trailing">context</span>}
                />
            );

            expect(screen.getByTestId('trailing')).toBeInTheDocument();
        });

        it('omits the slot entirely when nothing is passed — control', () => {
            const { container } = render(
                <SearchHeader
                    searchQuery=""
                    onSearchQueryChange={jest.fn()}
                    totalCount={2}
                    filteredCount={2}
                    hasLoadedOnce
                    alwaysShowCount
                />
            );

            expect(container.querySelector('[data-testid="trailing"]')).not.toBeInTheDocument();
        });

        it('does not render when the count itself is hidden', () => {
            // No point anchoring context to a row that is not there.
            render(
                <SearchHeader
                    searchQuery=""
                    onSearchQueryChange={jest.fn()}
                    totalCount={0}
                    filteredCount={0}
                    hasLoadedOnce={false}
                    countTrailing={<span data-testid="trailing">context</span>}
                />
            );

            expect(screen.queryByTestId('trailing')).not.toBeInTheDocument();
        });
    });
});
