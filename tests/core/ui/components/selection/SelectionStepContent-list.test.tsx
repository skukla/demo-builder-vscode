/**
 * What SelectionStepContent decides once the list is on screen.
 *
 * The `-states` sibling covers WHICH of the four states shows. This one covers
 * the adapters the fourth state is made of, all of which were unconstrained: the
 * Set→item translation on selection, the row body and its description slot, the
 * text a row answers typeahead with, and the three arguments it computes for
 * `SearchableList` (selected keys, autofocus, the refresh button's label).
 *
 * What is INSIDE `SearchableList` — the search field's own behaviour, the counts,
 * the no-results line — belongs to its 27 tests and is not repeated here. What is
 * pinned here is the ARGUMENT this component hands it.
 */

import { fireEvent, screen, within } from '@testing-library/react';
import { baseLabels, items, renderContent } from './SelectionStepContent.testUtils';
import type { OrgItem } from './SelectionStepContent.testUtils';
import '@testing-library/jest-dom';

/** The rendered rows, in order. */
function rows(container: HTMLElement): HTMLLIElement[] {
    return Array.from(container.querySelectorAll('li'));
}

/** More rows than SearchHeader's threshold of 5, so the search field renders. */
const MANY: OrgItem[] = Array.from({ length: 8 }, (_, i) => ({
    id: `org-${i}`,
    name: `Org ${i}`,
}));

function searchField(container: HTMLElement): HTMLElement | null {
    return container.querySelector('[data-testid="spectrum-searchfield"]');
}

describe('SelectionStepContent — selecting a row', () => {
    it('hands onSelect the whole ITEM, not the key the list reports', () => {
        const onSelect = jest.fn();
        const { container } = renderContent({ onSelect });

        fireEvent.click(rows(container)[0]);

        expect(onSelect).toHaveBeenCalledWith(items[0]);
    });

    // The lookup has to match the row that was clicked. Returning the first item
    // whatever was pressed is the failure this catches, and it looks correct for
    // as long as the test only ever clicks row one.
    it('resolves the row that was actually clicked', () => {
        const onSelect = jest.fn();
        const { container } = renderContent({ onSelect });

        fireEvent.click(rows(container)[1]);

        expect(onSelect).toHaveBeenCalledWith(items[1]);
    });

    // `items` is the source of truth for the object handed back, and the list
    // renders `filteredItems` — so a row with no matching item selects nothing
    // rather than reporting `undefined` as a selection.
    it('selects nothing when the clicked row is not in items', () => {
        const onSelect = jest.fn();
        const stray: OrgItem = { id: 'not-in-items', name: 'Stray Org' };
        const { container } = renderContent({ onSelect, filteredItems: [...items, stray] });

        fireEvent.click(rows(container)[2]);

        expect(onSelect).not.toHaveBeenCalled();
    });
});

describe('SelectionStepContent — how a row is built', () => {
    it('answers typeahead with the item title when it has one', () => {
        const titled: OrgItem[] = [{ id: 'o1', name: 'Legal Name', title: 'Friendly Title' }];
        const { container } = renderContent({ items: titled, filteredItems: titled });

        expect(rows(container)[0]).toHaveAttribute('data-text-value', 'Friendly Title');
    });

    it('falls back to the name when the item has no title', () => {
        const { container } = renderContent();

        expect(rows(container)[0]).toHaveAttribute('data-text-value', 'Selectable Org');
    });

    it('renders the caller description under an item that has no disabled reason', () => {
        renderContent({
            renderDescription: (item: OrgItem) => <span>why {item.id} matters</span>,
        });

        expect(screen.getByText('why o1 matters')).toBeInTheDocument();
    });

    // The disabled reason REPLACES the caller's description — a greyed row reads
    // as one line of "why not", not two competing subtitles.
    it('drops the caller description on a row that carries a disabled reason', () => {
        const { container } = renderContent({
            disabledIds: ['o2'],
            disabledReasons: { o2: 'Sign in with a different account.' },
            renderDescription: (item: OrgItem) => <span>why {item.id} matters</span>,
        });

        expect(within(rows(container)[1]).queryByText('why o2 matters')).not.toBeInTheDocument();
        expect(
            within(rows(container)[1]).getByText('Sign in with a different account.')
        ).toBeInTheDocument();
    });
});

describe('SelectionStepContent — what it hands SearchableList', () => {
    it('marks the selected row selected', () => {
        const { container } = renderContent({ selectedId: 'o2' });

        expect(rows(container)[1]).toHaveAttribute('aria-selected', 'true');
        expect(rows(container)[0]).not.toHaveAttribute('aria-selected');
    });

    it('selects nothing when no id is given', () => {
        const { container } = renderContent();

        expect(rows(container).filter((row) => row.hasAttribute('aria-selected'))).toStrictEqual(
            []
        );
    });

    // Opening on a list with nothing chosen puts the cursor in the filter; opening
    // on a list with a row already chosen must NOT, or the selection scrolls out
    // from under the person who made it.
    it('opens the filter focused when nothing is selected yet', () => {
        const { container } = renderContent({ items: MANY, filteredItems: MANY });

        expect(searchField(container)).toHaveAttribute('data-autofocus', 'true');
    });

    it('leaves focus alone when a row is already selected', () => {
        const { container } = renderContent({
            items: MANY,
            filteredItems: MANY,
            selectedId: 'org-3',
        });

        expect(searchField(container)).not.toHaveAttribute('data-autofocus');
    });

    it('labels the refresh button with the plural noun the caller supplied', () => {
        renderContent({ labels: { ...baseLabels, itemNounPlural: 'repositories' } });

        expect(screen.getByRole('button', { name: 'Refresh repositories' })).toBeInTheDocument();
    });

    it('builds the plural from the singular noun when the caller gives none', () => {
        renderContent();

        expect(screen.getByRole('button', { name: 'Refresh organizations' })).toBeInTheDocument();
    });
});
