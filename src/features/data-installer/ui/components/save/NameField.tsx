/**
 * A new datapack's name (step-04 S2; decisions Phase 7b, J3-1): one field, Datapack Name, with the
 * reason a name was refused under it. Room for that reason is kept from the first frame, so the
 * reason arriving moves nothing (prototype-conventions rule 14): a hidden copy of the field showing
 * the longest reason it could give sits in the same grid cell (`modal-steps`, the house's way to let
 * the tallest of several states set the height), so the room is the field's own error, not a guess.
 *
 * @module features/data-installer/ui/components/save/NameField
 */

import React from 'react';
import { FormField } from '@/core/ui/components/forms/FormField';

export interface NameFieldProps {
    name: string;
    onChange: (name: string) => void;
    /** Why the name was refused, once Save was pressed with one it refuses. */
    error?: string;
    /** The longest reason it could show: the room kept under the field. */
    room: string;
}

const NO_CHANGE = (): void => undefined;

export function NameField({ name, onChange, error, room }: NameFieldProps): React.ReactElement {
    return (
        <div className="modal-steps">
            <div>
                <FormField
                    fieldKey="datapackName"
                    label="Datapack Name"
                    type="text"
                    value={name}
                    onChange={onChange}
                    required
                    error={error}
                    showError={error !== undefined}
                />
            </div>
            <div className="modal-steps-ghost" aria-hidden="true">
                <FormField
                    fieldKey="datapackNameRoom"
                    label="Datapack Name"
                    type="text"
                    value=""
                    onChange={NO_CHANGE}
                    required
                    error={room}
                    showError
                />
            </div>
        </div>
    );
}
