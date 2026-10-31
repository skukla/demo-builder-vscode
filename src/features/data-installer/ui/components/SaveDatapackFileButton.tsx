/**
 * "Save as file" — one pack, from one store, into a datapack zip the SC chooses
 * where to keep.
 *
 * Self-contained on purpose: it owns its one request, so the result of an export drops
 * it in without threading save state through a view that is already past its size
 * guideline. The flyout offers it as a menu row instead (`PackActions`), through the same
 * request (`useSaveDatapackFile`). The
 * host opens VS Code's own save dialog; a dismissed dialog is not a failure and
 * shows nothing.
 *
 * @module features/data-installer/ui/components/SaveDatapackFileButton
 */

import { Button } from '@adobe/react-spectrum';
import React, { useCallback } from 'react';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

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

/** A pack's Save as file: start it, whether it is running, and the line saying where it went. */
export interface SaveDatapackFile {
    start: () => void;
    saving: boolean;
    /** Where it went, or why not; nothing for a dismissed dialog or before the first save. */
    note: React.JSX.Element | null;
}

/**
 * The save on its own, for the flyout's menu row (`PackActions`), which starts it from the menu
 * and shows the line under the flyout's actions.
 */
export function useSaveDatapackFile(id: DatapackId, source: DatapackStoreName = 'installer'): SaveDatapackFile {
    const save = useDataInstallerRequest<SaveResult>('save-datapack-zip');
    const run = save.load;
    const start = useCallback((): void => {
        run({ source, datapackName: id.name, version: id.version });
    }, [run, source, id.name, id.version]);
    return { start, saving: save.loading, note: renderSaveNote(save.value, save.failure?.message) };
}

export function SaveDatapackFileButton({
    id,
    source = 'installer',
}: SaveDatapackFileButtonProps): React.JSX.Element {
    const { start, saving, note } = useSaveDatapackFile(id, source);
    return (
        <div className="datapack-save-file">
            {/* Spectrum's busy button, not a "-ing" label (owner, 2026-10-31). */}
            <Button variant="secondary" onPress={start} isPending={saving}>
                Save as file
            </Button>
            {note}
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
