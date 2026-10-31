/**
 * "Copy to the Data Installer" — put a library pack in the Data Installer's catalog.
 *
 * Shown only with the service engine chosen, which installs from its own catalog alone:
 * Demo Builder's engine installs a library pack directly (`DatapackDetailPanel`). Once
 * every data type has landed, the same flyout offers Import. The copy writes into the
 * catalog other teams share and the extension cannot
 * remove it again, so the button says so before it is pressed, and the press is the
 * confirmation (the handler also wants the pack name back, which this sends).
 *
 * @module features/data-installer/ui/components/CopyToInstallerButton
 */

import { Button } from '@adobe/react-spectrum';
import React, { useCallback } from 'react';
import { dataTypeLabel } from '../dataTypeLabel';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import type { DatapackId } from '@/types/datapack';

/** What `copy-library-datapack-to-installer` did. */
interface CopyOutcome {
    stored: string[];
    failed: Array<{ dataType: string; reason: string }>;
}

export interface CopyToInstallerButtonProps {
    id: DatapackId;
    /** Open the Import for this pack — offered once the whole pack is in the Data Installer. */
    onImport: (id: DatapackId) => void;
}

export function CopyToInstallerButton({
    id,
    onImport,
}: CopyToInstallerButtonProps): React.JSX.Element {
    const copy = useDataInstallerRequest<CopyOutcome>('copy-library-datapack-to-installer');
    const run = copy.load;
    const start = useCallback((): void => {
        run({ datapackName: id.name, version: id.version, confirmName: id.name });
    }, [run, id.name, id.version]);

    if (copy.value) {
        return <CopyResult outcome={copy.value} onImport={() => onImport(id)} />;
    }
    return (
        <div className="datapack-save-file">
            <p className="datapack-export-note">
                Other teams will see {id.name} in the Data Installer&apos;s catalog, and it cannot
                be removed from here.
            </p>
            {/* Spectrum's busy button, not a "-ing" label (owner, 2026-10-31). */}
            <Button variant="accent" onPress={start} isPending={copy.loading}>
                Copy to the Data Installer
            </Button>
            {copy.failure ? (
                <p className="datapack-export-note">It was not copied: {copy.failure.message}</p>
            ) : null}
        </div>
    );
}

/** Import once everything landed; otherwise which types did not, and why. */
function CopyResult({
    outcome,
    onImport,
}: {
    outcome: CopyOutcome;
    onImport: () => void;
}): React.JSX.Element {
    if (outcome.failed.length > 0) {
        return (
            <div className="datapack-save-file">
                <p className="datapack-export-note">
                    Copied {outcome.stored.length} of{' '}
                    {outcome.stored.length + outcome.failed.length} data types. Not copied:{' '}
                    {outcome.failed
                        .map((f) => `${dataTypeLabel(f.dataType)} (${f.reason})`)
                        .join('; ')}
                </p>
            </div>
        );
    }
    return (
        <div className="datapack-save-file">
            <p className="datapack-export-note">Copied into the Data Installer.</p>
            <Button variant="accent" onPress={onImport}>
                Import
            </Button>
        </div>
    );
}
