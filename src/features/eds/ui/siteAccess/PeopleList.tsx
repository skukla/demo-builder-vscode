/**
 * Who has access: one row per person, with everything they hold beside the
 * email, removals in the row's ⋮ menu (`CardActionsMenu`), and giving access as
 * the dashed `AddCard` row at the end (PL-62).
 *
 * Rows, not cards (owner, 2026-10-07): a person is one line of facts, emails are
 * long, and a list of people is scanned top to bottom.
 *
 * The row borrows the house list-row shape (`integration-row*`, from
 * `integration-cards.css`) rather than reusing `IntegrationRow`, which is driven
 * by an integration model a person has none of. `site-access-row` takes away the
 * pointer and hover lift: the row opens nothing, so it must not look as if it
 * does. Only the menu is a control.
 *
 * @module features/eds/ui/siteAccess/PeopleList
 */

import { Item, View } from '@adobe/react-spectrum';
import React from 'react';
import type { AccessRemoval, AccessRow } from './accessRows';
import { AddCard } from '@/core/ui/components/ui/AddCard';
import { CardActionsMenu } from '@/core/ui/components/ui/CardActionsMenu';

export interface PeopleListProps {
    rows: AccessRow[];
    /** Whether the Give access row shows: this identity can grant something. */
    canGive: boolean;
    onGive: () => void;
    onRemove: (email: string, removal: AccessRemoval) => void;
}

function PersonRow({ row, onRemove }: { row: AccessRow; onRemove: PeopleListProps['onRemove'] }) {
    const removalOf = (key: React.Key): AccessRemoval | undefined =>
        row.removals.find((removal) => removal.type === key);
    return (
        <div className="integration-row site-access-row">
            <div className="integration-row-main">
                <div className="integration-row-name" title={row.email}>
                    {row.email}
                </div>
                <span className="text-md text-gray-700">{row.roles.join(', ')}</span>
            </div>
            {/* The menu button's height is kept on a row without one, so every
                row is the same height. */}
            <View UNSAFE_className="integration-row-trailing" minHeight="size-400">
                {row.removals.length > 0 ? (
                    <CardActionsMenu
                        ariaLabel={`More actions for ${row.email}`}
                        onAction={(key) => {
                            const removal = removalOf(key);
                            if (removal) onRemove(row.email, removal);
                        }}
                    >
                        {row.removals.map((removal) => (
                            <Item key={removal.type}>{removal.label}</Item>
                        ))}
                    </CardActionsMenu>
                ) : null}
            </View>
        </div>
    );
}

export function PeopleList({ rows, canGive, onGive, onRemove }: PeopleListProps): React.ReactElement {
    return (
        <div className="integration-row-list">
            {rows.map((row) => (
                <PersonRow key={row.email} row={row} onRemove={onRemove} />
            ))}
            {canGive ? <AddCard name="Give access" onOpen={onGive} cardClassName="integration-row" /> : null}
        </div>
    );
}
