/**
 * A datapack's Version History (owner, 2026-11-09, walk F99): its saves by when each was made, the
 * one this demo uses marked (in use), and Restore Version, which opens the import of the one chosen.
 * A pack of saves is one thing on its card; its earlier saves live here, so a bad save can be undone
 * without a version picker on every card. Restoring deletes no save.
 *
 * A Form (`FormDialog`): a choice, with nothing to warn about until the import's own window says
 * what it replaces.
 *
 * @module features/data-installer/ui/components/VersionHistoryDialog
 */

import { Radio, RadioGroup } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { versionLabel } from '../../packVersions';
import { FormDialog } from '@/core/ui/components/ui/FormDialog';

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
    const [chosen, setChosen] = useState<string | undefined>(undefined);
    // The choice starts afresh each time the dialog opens.
    useEffect(() => {
        if (isOpen) setChosen(undefined);
    }, [isOpen]);
    const restorable = chosen !== undefined && chosen !== inUse;
    return (
        <FormDialog
            isOpen={isOpen}
            title="Version History"
            lead={<>This demo&rsquo;s data goes back to the version you choose.</>}
            submitLabel="Restore Version"
            onSubmit={() => chosen && onRestore(chosen)}
            submitDisabled={!restorable}
            onClose={onClose}
        >
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
        </FormDialog>
    );
}
