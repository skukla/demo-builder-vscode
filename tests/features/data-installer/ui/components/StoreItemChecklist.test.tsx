/**
 * Save From Store's categories as an indented tree with ticks (decisions Phase 6, J1-3a: "Categories
 * show as an indented tree; a filtered match keeps its parents"; `TreeList` moved to core for this).
 * The ticks behave as the flat list's did: one tick names one category, Select All ticks what the
 * filter matches, the count says how many match. Every other kind stays a flat list.
 *
 * Drawn through `StoreKindItems`, the one place that decides a kind's list. Category names are their
 * place under the root, as `storeItems.ts` writes them ("Gear / Bags").
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { change, press } from '../../../../helpers/reactSettle';
import type { StoreItem, StoreItemPage } from '@/features/data-installer/pickableKinds';
import { StoreKindItems } from '@/features/data-installer/ui/components/StoreKindItems';

const category = (id: string, displayName: string): StoreItem => ({
    id,
    displayName,
    key: displayName.split(' / ').join('/'),
});

// "Women" is not listed (already in the pack being saved), so "Women / Tops" hangs under a name alone.
const CATEGORIES: StoreItem[] = [
    category('3', 'Gear'),
    category('4', 'Gear / Bags'),
    category('6', 'Gear / Watches'),
    category('9', 'Gear / Watches / Smart Watches'),
    category('7', 'Sale'),
    category('21', 'Women / Tops'),
];
const page = (items: StoreItem[]): StoreItemPage => ({
    items,
    totalCount: items.length,
    excludedCount: 0,
    inPackCount: 0,
});
const ALL_IDS = CATEGORIES.map((c) => c.id);

function draw(kind: 'categories' | 'products', items: StoreItem[], picked: string[] = []) {
    const onChange = jest.fn();
    render(
        <StoreKindItems
            kind={kind}
            page={page(items)}
            loading={false}
            picked={picked}
            onChange={onChange}
        />
    );
    return onChange;
}

const tick = (name: string) => screen.getByRole('checkbox', { name });
const filter = () => screen.getByRole('searchbox', { name: 'Filter categories' });
const levels = () =>
    screen.getAllByRole('treeitem').map((i) => [i.textContent, i.getAttribute('aria-level')]);

describe('categories, as a tree', () => {
    it('draws each category under its parent, by its own name, with a tick', () => {
        draw('categories', CATEGORIES);

        expect(levels()).toEqual([
            ['Gear', '1'],
            ['Bags', '2'],
            ['Watches', '2'],
            ['Smart Watches', '3'],
            ['Sale', '1'],
            ['Women', '1'],
            ['Tops', '2'],
        ]);
        expect(tick('Smart Watches')).toBeInTheDocument();
        expect(screen.queryByText('Gear / Bags')).not.toBeInTheDocument();
    });

    it('gives a parent that is not listed no tick, and counts only what is listed', () => {
        draw('categories', CATEGORIES);

        const women = screen.getAllByRole('treeitem')[5];
        expect(within(women).queryByRole('checkbox')).not.toBeInTheDocument();
        // CONTROL: its listed child has one.
        expect(tick('Tops')).toBeInTheDocument();
        expect(screen.getByText('6 categories')).toBeInTheDocument();
    });

    it('ticks one category alone, its children untouched', async () => {
        const onChange = draw('categories', CATEGORIES, ['7']);

        await press(tick('Gear'));

        expect(onChange).toHaveBeenCalledWith(['7', '3']);
    });

    it('unticks one category alone', async () => {
        const onChange = draw('categories', CATEGORIES, ['3', '4']);

        await press(tick('Gear'));

        expect(onChange).toHaveBeenCalledWith(['4']);
    });

    it('draws every category ticked when the kind is ticked whole', () => {
        draw('categories', CATEGORIES, ALL_IDS);

        expect(tick('Select All')).toBeChecked();
        ['Gear', 'Bags', 'Smart Watches', 'Tops'].forEach((name) =>
            expect(tick(name)).toBeChecked()
        );
    });

    it('ticks every category with Select All', async () => {
        const onChange = draw('categories', CATEGORIES, ['4']);
        expect(tick('Select All')).toBePartiallyChecked();

        await press(tick('Select All'));

        expect(onChange).toHaveBeenCalledWith(['4', '3', '6', '9', '7', '21']);
    });
});

describe('categories, filtered', () => {
    it('keeps the parents of a match, muted, and counts the matches alone', async () => {
        draw('categories', CATEGORIES);

        await change(filter(), 'smart');

        expect(levels()).toEqual([
            ['Gear', '1'],
            ['Watches', '2'],
            ['Smart Watches', '3'],
        ]);
        const [gear, , smart] = screen.getAllByRole('treeitem');
        expect(gear).toHaveClass('tree-list-row--context');
        expect(smart).not.toHaveClass('tree-list-row--context');
        expect(screen.getByText('1 of 6 categories')).toBeInTheDocument();
    });

    it('ticks only the matches with Select All, not the parents kept to place them', async () => {
        const onChange = draw('categories', CATEGORIES);
        await change(filter(), 'smart');

        await press(tick('Select All'));

        expect(onChange).toHaveBeenCalledWith(['9']);
    });

    it('unticks only the matches with Select All when they are all ticked', async () => {
        const onChange = draw('categories', CATEGORIES, ['3', '9']);
        await change(filter(), 'smart');
        expect(tick('Select All')).toBeChecked();

        await press(tick('Select All'));

        expect(onChange).toHaveBeenCalledWith(['3']);
    });

    it('draws no rows and no Select All when nothing matches', async () => {
        draw('categories', CATEGORIES);

        await change(filter(), 'shoes');

        expect(screen.queryAllByRole('treeitem')).toHaveLength(0);
        expect(screen.queryByRole('checkbox', { name: 'Select All' })).not.toBeInTheDocument();
        expect(screen.getByText('0 of 6 categories')).toBeInTheDocument();
    });
});

describe('every other kind', () => {
    it('stays a flat list, named in full', () => {
        draw('products', [
            { id: 'VR-Rack', displayName: 'VR Rack / Large', detail: 'VR-Rack', key: 'VR-Rack' },
        ]);

        // CONTROL: the row is drawn.
        expect(tick('VR Rack / Large')).toBeInTheDocument();
        expect(screen.queryByRole('tree')).not.toBeInTheDocument();
    });
});
