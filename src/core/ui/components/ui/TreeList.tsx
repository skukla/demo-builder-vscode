/**
 * A tree of records, each indented under its parent, so the structure shows at a glance (owner,
 * 2026-11-11, J1-3: "we need to be able to discern the category tree structure visually. This is
 * a reusable challenge"; J1-3a: "Pass"). Filtering keeps the parents of a match, muted, so a match
 * keeps its place in the tree.
 *
 * Moved from the datapack-simplification prototype (`mockups/flow/TreeList.tsx`) unchanged in look;
 * `renderRow` was added so a row can carry a control, as Save From Store's categories carry a tick
 * (`StoreItemChecklist`). Without it a row is its name.
 *
 * Styled by `core/ui/styles/tree-list.css`, which each host bundle imports in its entry
 * (ADR-017 §6): `dataInstaller` today.
 *
 * @module core/ui/components/ui/TreeList
 */

import React from 'react';
import { cn } from '@/core/ui/utils/classNames';

export interface TreeListNode {
    name: string;
    /** What the caller knows the record by, handed back on its row (a tick names it). */
    id?: string;
    children?: TreeListNode[];
}

/** One row as drawn: the node's name and id, how deep it sits, and whether the filter matched it. */
export interface TreeListRow {
    key: string;
    name: string;
    id?: string;
    depth: number;
    matched: boolean;
}

/** Each node in order, parents before children; with a query, matches and the parents above them. */
export function treeRows(nodes: readonly TreeListNode[], query: string): TreeListRow[] {
    const q = query.trim().toLowerCase();
    const rows: TreeListRow[] = [];
    const walk = (list: readonly TreeListNode[], depth: number, prefix: string): boolean => {
        let any = false;
        list.forEach((node, i) => {
            const key = `${prefix}${i}`;
            const at = rows.length;
            const matched = q === '' || node.name.toLowerCase().includes(q);
            rows.push({ key, name: node.name, id: node.id, depth, matched });
            const below = walk(node.children ?? [], depth + 1, `${key}.`);
            if (!matched && !below) rows.splice(at);
            else any = true;
        });
        return any;
    };
    walk(nodes, 0, '');
    return rows;
}

export interface TreeListProps {
    nodes: readonly TreeListNode[];
    query?: string;
    /** What a row shows after its elbow; its name when not given. */
    renderRow?: (row: TreeListRow) => React.ReactNode;
}

/** The rows, indented by depth. A parent kept only for a match below it is muted. */
export function TreeList({ nodes, query = '', renderRow }: TreeListProps): React.ReactElement {
    const rows = treeRows(nodes, query);
    return (
        <div role="tree">
            {rows.map((row) => (
                <div
                    key={row.key}
                    role="treeitem"
                    aria-level={row.depth + 1}
                    className={cn('tree-list-row', !row.matched && 'tree-list-row--context')}
                    style={{ '--tree-depth': row.depth } as React.CSSProperties}
                >
                    {row.depth > 0 ? <span className="tree-list-elbow" aria-hidden="true" /> : null}
                    {renderRow ? renderRow(row) : row.name}
                </div>
            ))}
        </div>
    );
}
