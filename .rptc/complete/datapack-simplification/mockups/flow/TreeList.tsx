/**
 * PROPOSED shared component: a read-only tree of records, each indented under its parent, so the
 * structure shows at a glance (owner, 2026-11-11, J1-3: "we need to be able to discern the category
 * tree structure visually. This is a reusable challenge"). Nothing in the house drew one: Save From
 * Store lists a category as its path ("Gear / Bags"), and the ERP's Assign Products narrows by two
 * pickers and shows only the last part of the name.
 *
 * Filtering keeps the parents of a match, muted, so a match keeps its place in the tree.
 *
 * Written to move to `src/core/ui/components/` once the review settles it; it holds no prototype
 * state and takes only its nodes and the filter.
 */

import React from 'react';

export interface TreeListNode {
    name: string;
    children?: TreeListNode[];
}

/** One row as drawn: the node's name, how deep it sits, and whether the filter matched it. */
export interface TreeListRow {
    key: string;
    name: string;
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
            rows.push({ key, name: node.name, depth, matched });
            const below = walk(node.children ?? [], depth + 1, `${key}.`);
            if (!matched && !below) rows.splice(at);
            else any = true;
        });
        return any;
    };
    walk(nodes, 0, '');
    return rows;
}

/** The rows, indented by depth. A parent kept only for a match below it is muted. */
export function TreeList({ nodes, query = '' }: { nodes: readonly TreeListNode[]; query?: string }): React.ReactElement {
    const rows = treeRows(nodes, query);
    return (
        <div className="tree-list" role="tree">
            {rows.map((row) => (
                <div
                    key={row.key}
                    role="treeitem"
                    aria-level={row.depth + 1}
                    className={`tree-list-row${row.matched ? '' : ' tree-list-row--context'}`}
                    style={{ paddingLeft: `${row.depth * 20}px` }}
                >
                    {row.depth > 0 ? <span className="tree-list-elbow" aria-hidden="true" /> : null}
                    {row.name}
                </div>
            ))}
        </div>
    );
}
