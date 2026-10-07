/**
 * One Site access list — who administers the site, or who reads its content —
 * drawn the way every other collection here is: a card per person in the house
 * grid, Remove in the card's ⋮ menu (`CardActionsMenu`), and adding as the dashed
 * `AddCard` at the end (PL-62).
 *
 * The person card stays local rather than reusing `IntegrationCard`: that one is
 * driven by an integration model (deploy status, linked cards, rename, setup
 * steps) a person has none of. It borrows the same card shape instead
 * (`integration-card*`, from `integration-cards.css`) inside the projects grid
 * (`projects-grid`, from `shared-ui.css`), so a person reads like an integration
 * or a project rather than as a box of its own.
 *
 * @module features/eds/ui/siteAccess/PeopleGrid
 */

import { Item } from '@adobe/react-spectrum';
import React from 'react';
import { AddCard } from '@/core/ui/components/ui/AddCard';
import { CardActionsMenu } from '@/core/ui/components/ui/CardActionsMenu';
import type { SiteAccessPerson } from '@/types/webviewPayloads';

export interface PeopleGridProps {
    people: SiteAccessPerson[];
    /** Whether this identity can add and remove here. */
    canManage: boolean;
    /** The add card's words, "Add a site admin". Omit while a filter narrows the grid. */
    addLabel?: string;
    onAdd: () => void;
    onRemove: (email: string) => void;
}

interface PersonCardProps {
    person: SiteAccessPerson;
    canRemove: boolean;
    onRemove: (email: string) => void;
}

function PersonCard({ person, canRemove, onRemove }: PersonCardProps): React.ReactElement {
    return (
        <div className="integration-card">
            <div className="integration-card-head">
                <div className="integration-card-name" title={person.email}>
                    {person.email}
                </div>
                {canRemove ? (
                    <CardActionsMenu
                        ariaLabel={`More actions for ${person.email}`}
                        onAction={() => onRemove(person.email)}
                    >
                        <Item key="remove">Remove</Item>
                    </CardActionsMenu>
                ) : null}
            </div>
            <div className="integration-card-statusline text-gray-600">{person.role}</div>
        </div>
    );
}

export function PeopleGrid({
    people,
    canManage,
    addLabel,
    onAdd,
    onRemove,
}: PeopleGridProps): React.ReactElement {
    return (
        <div className="projects-grid">
            {people.map((person) => (
                <PersonCard
                    key={person.email}
                    person={person}
                    canRemove={canManage && person.removable}
                    onRemove={onRemove}
                />
            ))}
            {canManage && addLabel ? (
                <AddCard name={addLabel} onOpen={onAdd} cardClassName="integration-card" />
            ) : null}
        </div>
    );
}
