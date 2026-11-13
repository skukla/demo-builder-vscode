/**
 * "Save As New Datapack" (step-04 S2; decisions Phase 7b, J3-1, owner 2026-11-12): the house form
 * (`FormDialog`), one field, Datapack Name, Cancel and Save, and no line (Phase 7b's leads are struck:
 * prototype-conventions rules 5 and 6). The name starts as the opener gives it: empty, or "My Bodea"
 * from someone else's datapack. Save checks it against the SC's own datapacks' names (`nameProblem`,
 * which the save itself checks too) and shows a refusal under the field, in room kept for it; a
 * name it takes is handed on to the run (`useSaveStoreChanges`), which this does not draw.
 *
 * @module features/data-installer/ui/components/save/SaveAsNewWindow
 */

import React, { useMemo, useState } from 'react';
import { longestNameProblem, nameProblem } from '../../../saveAsName';
import { NameField } from './NameField';
import { FormDialog } from '@/core/ui/components/ui/FormDialog';

export interface SaveAsNewWindowProps {
    /** The name the field starts with. */
    startName: string;
    /** The SC's own datapacks' names, which a new one may not take. */
    ownNames: readonly string[];
    /** Save, with a name it takes: start the run. */
    onSave: (name: string) => void;
    onClose: () => void;
}

export function SaveAsNewWindow({
    startName,
    ownNames,
    onSave,
    onClose,
}: SaveAsNewWindowProps): React.ReactElement {
    const [name, setName] = useState(startName);
    const [error, setError] = useState<string | undefined>(undefined);
    const room = useMemo(() => longestNameProblem(ownNames), [ownNames]);
    const rename = (next: string): void => {
        setName(next);
        setError(undefined);
    };
    const save = (): void => {
        const problem = nameProblem(name, ownNames);
        setError(problem);
        if (!problem) onSave(name.trim());
    };
    return (
        <FormDialog
            isOpen
            title="Save As New Datapack"
            submitLabel="Save"
            onSubmit={save}
            onClose={onClose}
        >
            <NameField name={name} onChange={rename} {...(error ? { error } : {})} room={room} />
        </FormDialog>
    );
}
