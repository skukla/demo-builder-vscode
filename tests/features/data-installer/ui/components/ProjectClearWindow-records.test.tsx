/**
 * Review Records on the project's Clear window (datapack-simplification step 06, C2b; decisions
 * Phase 6, J1-3b): the types on the left with their count once, the chosen type's records on the
 * right under Removed and Kept tabs, Kept greyed when nothing stays, the house notice dot after the
 * count of a type with kept records and on its Kept tab, column headers on both tabs, and categories
 * as a tree. It only looks: Back alone (rule 19).
 */

import { screen, within } from '@testing-library/react';
import { BODEA_CHECK } from '../../../../helpers/clearCheckFixtures';
import { answering, button, footer, openWindow, press } from './ProjectClearWindow.testUtils';

/** The left column's row for a type: its button. */
const railRow = (label: string): HTMLElement => {
    const row = Array.from(document.querySelectorAll<HTMLElement>('.datapack-picks-kind')).find(
        (b) => b.firstChild?.textContent === label
    );
    if (!row) throw new Error(`No rail row ${label}`);
    return row;
};

const tab = (label: string): HTMLElement =>
    screen.getByRole('button', { name: new RegExp(`^${label}`) });

const listed = (): string[] =>
    Array.from(document.querySelectorAll('.type-record, .tree-list-row')).map(
        (r) => r.textContent ?? ''
    );

async function openRecords(): Promise<void> {
    await openWindow();
    await press(button('Review Records'));
}

beforeEach(() => answering(BODEA_CHECK));

it('lists the types on the left, each with its count once, and the first type’s records on the right', async () => {
    await openRecords();

    expect(railRow('Products')).toHaveTextContent(/^Products2$/);
    expect(railRow('Orders')).toHaveTextContent(/^Orders3$/);
    expect(listed()).toEqual(['BD-RACK', 'BD-CHAIR']);
});

it('only looks: Back alone, and Back returns to the summary', async () => {
    await openRecords();

    expect(footer()).toEqual(['Back']);
    await press(button('Back'));

    expect(screen.getByRole('heading', { name: 'Clear Bodea Demo Data?' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
});

it('greys out the Kept tab of a type with nothing kept, and shows no dot for it', async () => {
    await openRecords();

    expect(tab('Kept')).toBeDisabled();
    expect(railRow('Products').querySelector('.status-dot')).toBeNull();
    expect(tab('Kept').querySelector('.status-dot')).toBeNull();
});

it('puts the notice dot after the count of a type with kept records, in a fixed slot, and on its Kept tab', async () => {
    await openRecords();

    const customers = railRow('Customers');
    expect(within(customers).getByLabelText('1 kept').querySelector('.status-dot')).toHaveAttribute(
        'data-variant',
        'warning'
    );
    // The slot is on every row, so the counts and the dots line up.
    expect(railRow('Products').querySelector('.type-rail-kept')).not.toBeNull();

    await press(customers);

    expect(tab('Kept')).not.toBeDisabled();
    expect(tab('Kept').querySelector('.status-dot')).toHaveAttribute('data-variant', 'warning');
});

it('shows the kept records under Kept, the same rows as Removed, with the same column header', async () => {
    await openRecords();
    await press(railRow('Customers'));
    expect(listed()).toEqual(['bd.store@example.com']);
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();

    await press(tab('Kept'));

    expect(listed()).toEqual(['bd.other@example.com']);
    expect(document.querySelector('.type-record')).toHaveTextContent('bd.other@example.com');
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
});

it('shows the categories going as a tree, each under its parent', async () => {
    await openRecords();

    await press(railRow('Categories'));

    const items = screen.getAllByRole('treeitem');
    expect(items.map((i) => [i.textContent, i.getAttribute('aria-level')])).toEqual([
        ['Racks', '1'],
        ['Server Racks', '2'],
    ]);
});

it('calls the first tab of orders Closed, since orders are closed, never deleted', async () => {
    await openRecords();

    await press(railRow('Orders'));

    expect(tab('Closed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Removed/ })).not.toBeInTheDocument();
});

it("says a type that couldn't be read on its row and in its pane", async () => {
    answering({
        ...BODEA_CHECK,
        rows: [
            ...BODEA_CHECK.rows,
            { type: 'companies', label: 'Companies', count: 0, happens: "Couldn't be read" },
        ],
        records: { ...BODEA_CHECK.records, companies: { removed: [], kept: [] } },
        unread: { companies: 'strange' },
    });
    await openRecords();

    const companies = railRow('Companies');
    expect(companies).toHaveTextContent("Couldn't be read");
    await press(companies);

    expect(screen.getByText("The records couldn't be read.")).toBeInTheDocument();
});
