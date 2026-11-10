/**
 * A datapack's Version History (owner, 2026-11-09, walk F99): its saves by when each was made, the
 * one this demo uses marked (in use), and Restore Version, which opens the import of the one chosen.
 * A pack of saves is one thing on its card; its earlier saves live here, so a bad save can be undone
 * without a version picker on every card. Restoring deletes no save.
 *
 * The house `Modal` in a `DialogContainer`, as `ConfirmActionDialog` is. That dialog was considered
 * and does not fit: it is a warning (the amber icon, every child a line of text), and this is a
 * choice, with nothing to warn about until the import's own window says what it replaces.
 *
 * @module features/data-installer/ui/components/VersionHistoryDialog
 */

import { DialogContainer, Radio, RadioGroup } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { versionLabel } from '../../packVersions';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { Modal } from '@/core/ui/components/ui/Modal';

export interface VersionHistoryDialogProps {
    isOpen: boolean;
    /** The pack's saves, newest first. */
    versions: readonly string[];
    /** The save this demo uses, when it uses one of them. */
    inUse?: string;
    /** Restore Version: the save chosen. */
    onRestore: (version: string) => void;
    onClose: () => void;
}

export function VersionHistoryDialog({
    isOpen,
    versions,
    inUse,
    onRestore,
    onClose,
}: VersionHistoryDialogProps): React.ReactElement {
    return (
        <DialogContainer onDismiss={onClose}>
            {isOpen && (
                <HistoryBody
                    versions={versions}
                    inUse={inUse}
                    onRestore={onRestore}
                    onClose={onClose}
                />
            )}
        </DialogContainer>
    );
}

/** Its own component so the choice starts afresh each time the dialog opens. */
function HistoryBody({
    versions,
    inUse,
    onRestore,
    onClose,
}: Omit<VersionHistoryDialogProps, 'isOpen'>): React.ReactElement {
    const [chosen, setChosen] = useState<string | undefined>(undefined);
    const restorable = chosen !== undefined && chosen !== inUse;
    return (
        <Modal
            title="Version History"
            size="S"
            fitContent
            onClose={onClose}
            closeLabel="Cancel"
            actionButtons={[
                {
                    label: 'Restore Version',
                    variant: 'accent',
                    onPress: () => chosen && onRestore(chosen),
                    isDisabled: !restorable,
                },
            ]}
        >
            <div className="dialog-stack">
                <LeadText>This demo&rsquo;s data goes back to the version you choose.</LeadText>
                <RadioGroup aria-label="Versions" value={chosen ?? null} onChange={setChosen}>
                    {versions.map((version) => (
                        <Radio key={version} value={version}>
                            {versionLabel(version)}
                            {version === inUse ? (
                                <span className="text-sm text-gray-700"> (in use)</span>
                            ) : null}
                        </Radio>
                    ))}
                </RadioGroup>
            </div>
        </Modal>
    );
}
