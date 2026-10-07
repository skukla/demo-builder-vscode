/**
 * One Site access list — who administers the site, or who reads its content —
 * as one row per person: the email, the role beside it, Remove in the row's ⋮
 * menu (`CardActionsMenu`), and adding as the dashed `AddCard` row at the end
 * (PL-62).
 *
 * Rows, not cards (owner, 2026-10-07): a person is one line of facts, emails are
 * long, and a list of people is scanned top to bottom. Rows only, with no
 * cards/rows toggle, since cards would never be the better view here.
 *
 * The row stays local rather than reusing `IntegrationRow`: that one is driven
 * by an integration model (deploy status, rename, setup steps) a person has none
 * of. It borrows the same row shape instead (`integration-row*`, from
 * `integration-cards.css`), so a person reads like an integration in its list
 * view rather than as a box of its own.
 *
 * @module features/eds/ui/siteAccess/PeopleList
 */

import { Item, View } from '@adobe/react-spectrum';
import React from 'react';
import { AddCard } from '@/core/ui/components/ui/AddCard';
import { CardActionsMenu } from '@/core/ui/components/ui/CardActionsMenu';
import type { SiteAccessPerson } from '@/types/webviewPayloads';

export interface PeopleListProps {
    people: SiteAccessPerson[];
    /** Whether this identity can add and remove here. */
    canManage: boolean;
    /** The add row's words, "Add a site admin". Omit while a filter narrows the list. */
    addLabel?: string;
    onAdd: () => void;
    onRemove: (email: string) => void;
}

interface PersonRowProps {
    person: SiteAccessPerson;
    canRemove: boolean;
    onRemove: (email: string) => void;
}

function PersonRow({ person, canRemove, onRemove }: PersonRowProps): React.ReactElement {
    return (
        <div className="integration-row">
            <div className="integration-row-main">
                <div className="integration-row-name" title={person.email}>
                    {person.email}
                </div>
                <span className="text-md text-gray-700">{person.role}</span>
            </div>
            {/* The menu button's height is kept even on a row without one (an org
                admin), so every row is the same height. */}
            <View UNSAFE_className="integration-row-trailing" minHeight="size-400">
                {canRemove ? (
                    <CardActionsMenu
                        ariaLabel={`More actions for ${person.email}`}
                        onAction={() => onRemove(person.email)}
                    >
                        <Item key="remove">Remove</Item>
                    </CardActionsMenu>
                ) : null}
            </View>
        </div>
    );
}

export function PeopleList({
    people,
    canManage,
    addLabel,
    onAdd,
    onRemove,
}: PeopleListProps): React.ReactElement {
    return (
        <div className="integration-row-list">
            {people.map((person) => (
                <PersonRow
                    key={person.email}
                    person={person}
                    canRemove={canManage && person.removable}
                    onRemove={onRemove}
                />
            ))}
            {canManage && addLabel ? (
                <AddCard name={addLabel} onOpen={onAdd} cardClassName="integration-row" />
            ) : null}
        </div>
    );
}
