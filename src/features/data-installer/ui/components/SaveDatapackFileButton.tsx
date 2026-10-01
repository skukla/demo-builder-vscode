/**
 * "Save as file" — one pack, from one store, into a datapack zip the SC chooses
 * where to keep.
 *
 * Self-contained on purpose: it owns its one request, so the two places that offer
 * it (a pack's detail flyout, and the result of an export) each drop it in without
 * threading save state through a view that is already past its size guideline. The
 * host opens VS Code's own save dialog; a dismissed dialog is not a failure and
 * shows nothing.
 *
 * @module features/data-installer/ui/components/SaveDatapackFileButton
 */

import { Button } from '@adobe/react-spectrum';
import React, { useCallback } from 'react';
import type { DatapackId, DatapackStoreName } from '../../types';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';

/** What `save-datapack-zip` answers. */
interface SaveResult {
    path?: string;
    cancelled?: boolean;
}

export interface SaveDatapackFileButtonProps {
    id: DatapackId;
    /** Which store holds the pack. Defaults to the Data Installer. */
    source?: DatapackStoreName;
}

export function SaveDatapackFileButton({
    id,
    source = 'installer',
}: SaveDatapackFileButtonProps): React.JSX.Element {
    const save = useDataInstallerRequest<SaveResult>('save-datapack-zip');
    const run = save.load;
    const start = useCallback((): void => {
        run({ source, datapackName: id.name, version: id.version });
    }, [run, source, id.name, id.version]);

    return (
        <div className="datapack-save-file">
            <Button variant="secondary" onPress={start} isDisabled={save.loading}>
                {save.loading ? 'Saving' : 'Save as file'}
            </Button>
            {renderSaveNote(save.value, save.failure?.message)}
        </div>
    );
}

/** Where it went, or why not. Nothing for a dismissed dialog or before the first save. */
function renderSaveNote(
    value: SaveResult | null,
    error: string | undefined,
): React.JSX.Element | null {
    if (error) {
        return <p className="datapack-export-note">The file could not be saved: {error}</p>;
    }
    if (value?.path) {
        return <p className="datapack-export-note">Saved to {value.path}</p>;
    }
    return null;
}
