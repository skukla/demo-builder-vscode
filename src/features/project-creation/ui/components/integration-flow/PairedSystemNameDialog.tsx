/**
 * PairedSystemNameDialog — the wizard's Settings for a paired integration: the name
 * of the system it brings (the ERP), the one thing about the pair that is fixed once
 * it is deployed.
 *
 * Not the dashboard's `IntegrationSettingsModal`: that one saves through the
 * extension and redeploys, and before creation there is nothing to save to or
 * redeploy. The name follows the rule the add used (`pairNameInputs`), so what is
 * saved here reads exactly as it would have if typed in the Add dialog.
 *
 * @module features/project-creation/ui/components/integration-flow/PairedSystemNameDialog
 */

import { DialogContainer, TextField } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { NAME_IS_FIXED } from './stages/CatalogStage';
import { Modal } from '@/core/ui/components/ui/Modal';
import type { IntegrationRow } from './integrationRows';
import {
    MAX_ERP_NAME,
    erpNameProblem,
    pairedSystemOf,
    systemWordOf,
    withSystemWord,
} from '@/features/app-builder/services/pairNames';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

export interface PairedSystemNameTarget {
    /** The integration's id (its inputs hold both names). */
    id: string;
    /** The integration's name, for the title. */
    integrationName: string;
    /** The system's current name. */
    systemName: string;
    /** What the system is ("ERP"). */
    systemWord: string;
}

/**
 * What the dialog opens on for a card's row, or null when the row's system cannot
 * be named (no paired system with a name input).
 *
 * @param row - the card's row
 * @param entries - the entries the rows were resolved against (systems included)
 * @returns the dialog target
 */
export function pairedSystemTarget(
    row: IntegrationRow,
    entries: readonly AppBuilderComponentCatalogEntry[],
): PairedSystemNameTarget | null {
    const entry = entries.find((candidate) => candidate.id === row.id);
    const system = entry && pairedSystemOf(entry, entries);
    if (!system || !row.companion) return null;
    return { id: row.id, integrationName: row.name, systemName: row.companion, systemWord: systemWordOf(system) };
}

export interface PairedSystemNameDialogProps {
    /** The pair whose settings are open, or null when closed. */
    target: PairedSystemNameTarget | null;
    onClose: () => void;
    /** Save the typed name; the rule that completes it is applied by the caller's handler. */
    onSave: (id: string, name: string) => void;
}

export function PairedSystemNameDialog({ target, onClose, onSave }: PairedSystemNameDialogProps): React.ReactElement {
    const [name, setName] = useState('');
    useEffect(() => {
        if (target) setName(target.systemName);
    }, [target]);

    const saved = target ? withSystemWord(name, target.systemWord) : '';
    const problem = target ? erpNameProblem(saved, []) : undefined;
    const ready = Boolean(target) && !problem && saved !== target?.systemName;
    const save = (): void => {
        if (!target || !ready) return;
        onSave(target.id, saved);
        onClose();
    };

    return (
        <DialogContainer onDismiss={onClose}>
            {target && (
                <Modal
                    title={`${target.integrationName} settings`}
                    size="S"
                    fitContent
                    onClose={onClose}
                    actionButtons={[{ label: 'Save', variant: 'accent', onPress: save, isDisabled: !ready }]}
                >
                    <TextField
                        label={`${target.systemWord} name`}
                        value={name}
                        onChange={setName}
                        maxLength={MAX_ERP_NAME}
                        autoFocus
                        width="100%"
                        validationState={problem ? 'invalid' : undefined}
                        errorMessage={problem}
                        description={NAME_IS_FIXED}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') save();
                        }}
                    />
                </Modal>
            )}
        </DialogContainer>
    );
}
