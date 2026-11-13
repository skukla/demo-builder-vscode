/**
 * "Save Your Changes First?", its own window (step 03, S6; the prototype's `SaveFirstWindow` and
 * `SaveFirstBody`): the one line, "Your changes will be lost if you don't save them.", over the
 * changes counted by type, no names (decisions Phase 3, J2-1, J2-3). No box: saving without asking
 * is the setting only. The losing choice sits apart at the footer's start, "Switch Without Saving";
 * Cancel and "Save and Switch" at its end. No other close: Cancel is the way out.
 *
 * The verb is a prop: Switch now; Uninstall, Reset and Delete reuse the window (J5-1, J7-2). When
 * the held datapack is not the SC's, a save makes a new one, named in the field here; a refused name
 * shows the house problem line and Save and <verb> waits. Room for that line is always kept, so the
 * window never grows (rule 14).
 *
 * @module features/data-installer/ui/components/job/SaveFirstWindow
 */

import { TextField } from '@adobe/react-spectrum';
import React from 'react';
import { type DatapackVerb, saveFirstLabel, withoutSavingLabel } from '../../../datapackWords';
import type { SaveAsField } from '../../hooks/useSwitchChanges';
import { TypeTable } from '../typeSummary/TypeTable';
import type { TypeRow } from './installRows';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';

export interface SaveFirstWindowProps {
    /** The job's verb on both commit buttons. */
    verb: DatapackVerb;
    /** The changes, counted by type. */
    rows: readonly TypeRow[];
    /** The changes could not be read: nothing is known of them. */
    readFailed: boolean;
    /** Present when a save makes a new datapack, which needs a name. */
    saveAs?: SaveAsField;
    /** Answered: save first (`true`) or not. */
    onAnswer: (saves: boolean) => void;
    onClose: () => void;
}

/** The name a new datapack takes, its problem under it. */
function SaveAsName({ field }: { field: SaveAsField }): React.ReactElement {
    return (
        <div>
            <TextField
                label="Save As"
                value={field.name}
                onChange={field.onName}
                width="100%"
                validationState={field.problem ? 'invalid' : undefined}
            />
            {/* Room kept for the problem line, so the window never grows (rule 14). */}
            <p className="dialog-problem text-negative">{field.problem ?? ' '}</p>
        </div>
    );
}

export function SaveFirstWindow({
    verb,
    rows,
    readFailed,
    saveAs,
    onAnswer,
    onClose,
}: SaveFirstWindowProps): React.ReactElement {
    return (
        <StepsWindow
            title="Save Your Changes First?"
            status="warning"
            hideClose
            startButtons={[
                {
                    label: withoutSavingLabel(verb),
                    variant: 'secondary',
                    onPress: () => onAnswer(false),
                },
            ]}
            actionButtons={[
                { label: 'Cancel', variant: 'secondary', onPress: onClose },
                {
                    label: saveFirstLabel(verb, false),
                    variant: 'accent',
                    onPress: () => onAnswer(true),
                    isDisabled: saveAs?.problem !== undefined,
                },
            ]}
            onClose={onClose}
        >
            <div className="clear-demo-body">
                <LeadText>{"Your changes will be lost if you don't save them."}</LeadText>
                {readFailed ? (
                    <p className="dialog-problem text-notice">
                        {"Your changes couldn't be checked."}
                    </p>
                ) : (
                    <TypeTable rows={rows} label="Your changes by type of data" />
                )}
                {saveAs ? <SaveAsName field={saveAs} /> : null}
            </div>
        </StepsWindow>
    );
}
