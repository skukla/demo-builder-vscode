/**
 * `TreeList`: records indented under their parents (decisions Phase 6, J1-3a, owner 2026-11-11:
 * "Pass"), ported from the walked prototype. A filtered match keeps its parents, muted, so it keeps
 * its place in the tree. A row may carry a control, such as a tick.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TreeList, treeRows, type TreeListNode } from '@/core/ui/components/ui/TreeList';

const GEAR: TreeListNode[] = [
    {
        name: 'Gear',
        id: '3',
        children: [
            { name: 'Bags', id: '4' },
            { name: 'Watches', id: '6', children: [{ name: 'Smart Watches', id: '9' }] },
        ],
    },
    { name: 'Sale', id: '7' },
];

const shape = (rows: ReturnType<typeof treeRows>) =>
    rows.map((r) => [r.name, r.depth, r.matched, r.id]);

describe('treeRows', () => {
    it('lists every node, parents before children, each at its depth', () => {
        expect(shape(treeRows(GEAR, ''))).toEqual([
            ['Gear', 0, true, '3'],
            ['Bags', 1, true, '4'],
            ['Watches', 1, true, '6'],
            ['Smart Watches', 2, true, '9'],
            ['Sale', 0, true, '7'],
        ]);
    });

    it('keeps the parents of a match, marked as not matched', () => {
        expect(shape(treeRows(GEAR, 'smart'))).toEqual([
            ['Gear', 0, false, '3'],
            ['Watches', 1, false, '6'],
            ['Smart Watches', 2, true, '9'],
        ]);
    });

    it('matches regardless of case and surrounding spaces, and drops what neither matches nor holds a match', () => {
        expect(shape(treeRows(GEAR, '  BAGS '))).toEqual([
            ['Gear', 0, false, '3'],
            ['Bags', 1, true, '4'],
        ]);
    });

    it('is empty when nothing matches', () => {
        expect(treeRows(GEAR, 'shoes')).toStrictEqual([]);
    });

    it('gives every row a key unique in the tree', () => {
        const keys = treeRows(GEAR, '').map((r) => r.key);
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe('TreeList', () => {
    it('draws a tree of rows, each at its level, with the elbow only under a parent', () => {
        render(<TreeList nodes={GEAR} />);

        const items = within(screen.getByRole('tree')).getAllByRole('treeitem');
        expect(items.map((i) => [i.textContent, i.getAttribute('aria-level')])).toEqual([
            ['Gear', '1'],
            ['Bags', '2'],
            ['Watches', '2'],
            ['Smart Watches', '3'],
            ['Sale', '1'],
        ]);
        // The indent is a parameter; `tree-list.css` turns it into the padding.
        expect(items[3].style.getPropertyValue('--tree-depth')).toBe('2');
        expect(items[0].querySelector('.tree-list-elbow')).toBeNull();
        expect(items[1].querySelector('.tree-list-elbow')).not.toBeNull();
    });

    it('mutes a parent kept only for a match below it', () => {
        render(<TreeList nodes={GEAR} query="bags" />);

        const [gear, bags] = screen.getAllByRole('treeitem');
        expect(gear).toHaveClass('tree-list-row', 'tree-list-row--context');
        expect(bags).toHaveClass('tree-list-row');
        expect(bags).not.toHaveClass('tree-list-row--context');
    });

    it('draws no rows when nothing matches', () => {
        render(<TreeList nodes={GEAR} query="shoes" />);

        // CONTROL: the tree itself is drawn.
        expect(screen.getByRole('tree')).toBeInTheDocument();
        expect(screen.queryAllByRole('treeitem')).toHaveLength(0);
    });

    it('draws what renderRow returns in place of the name, after the elbow', () => {
        render(
            <TreeList
                nodes={GEAR}
                renderRow={(row) => <button type="button">{`Tick ${row.name}`}</button>}
            />
        );

        const bags = screen.getAllByRole('treeitem')[1];
        expect(within(bags).getByRole('button', { name: 'Tick Bags' })).toBeInTheDocument();
        expect(bags.firstElementChild).toHaveClass('tree-list-elbow');
    });
});
