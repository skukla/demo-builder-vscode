/**
 * Cards that each turn on and off with a check: an export's store views and data types, which can
 * each take several. `ChoiceCard`'s toggle form (`pressed`).
 *
 * @module features/data-installer/ui/components/create-flow/stages/ToggleCards
 */

import React from 'react';
import { dataTypeLabel } from '../../../dataTypeLabel';
import { cn } from '@/core/ui/utils/classNames';
import { ChoiceCard } from '@/features/project-creation/ui/components/ChoiceCard';

export interface ToggleCardOption {
    id: string;
    name: string;
    description?: string;
}

/** Data type codes as cards: the code is the id sent, the name only what is shown. */
export const typeCardOptions = (types: readonly string[]): ToggleCardOption[] =>
    types.map((type) => ({ id: type, name: dataTypeLabel(type) }));

export interface ToggleCardsProps {
    options: readonly ToggleCardOption[];
    picked: readonly string[];
    onToggle: (id: string, on: boolean) => void;
    /** Three across rather than two: many short names. */
    dense?: boolean;
}

export function ToggleCards({ options, picked, onToggle, dense = false }: ToggleCardsProps): React.ReactElement {
    return (
        <div className={cn('datapack-flow-cards', dense && 'datapack-flow-cards--dense')}>
            {options.map(({ id, name, description }) => {
                const on = picked.includes(id);
                return (
                    <ChoiceCard
                        key={id}
                        variant="compact"
                        name={name}
                        description={description}
                        selected={on}
                        pressed={on}
                        onSelect={() => onToggle(id, !on)}
                    />
                );
            })}
        </div>
    );
}
