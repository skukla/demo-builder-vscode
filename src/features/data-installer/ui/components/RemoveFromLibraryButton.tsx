/**
 * "Remove it from the library" — delete one of the SC's own library packs.
 *
 * Offered in two places, both where it is safe by construction:
 * - after a load that CREATED the pack, where it is an exact undo (a load that updated an
 *   existing pack is not offered it: deleting would also remove what the pack held before).
 *   That is this button, removed on the one press;
 * - in the flyout of a library pack the SC owns, as the menu's "Remove from library"
 *   (`PackActions`), through the same request (`useLibraryRemoval`). A pack this SC shared in a
 *   project file (datapack-engine step 07) asks there first, with the warning
 *   `get-datapack-detail` carries.
 *
 * The library itself only lets a pack's owner delete it, so a stale `mine` cannot
 * remove anyone else's pack. Nothing here ever deletes from the Data Installer.
 *
 * @module features/data-installer/ui/components/RemoveFromLibraryButton
 */

import { Button } from '@adobe/react-spectrum';
import React, { useCallback, useEffect } from 'react';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import type { DatapackId } from '@/types/datapack';

/** A library pack's removal: start it, whether it is running or done, and the line saying so. */
export interface LibraryRemoval {
    start: () => void;
    removing: boolean;
    removed: boolean;
    /** "Removed from the library.", or why it could not be; nothing before it runs. */
    note: React.JSX.Element | null;
}

/**
 * Remove one of the SC's own library packs, confirmed (the caller has asked when it needed to).
 *
 * @param onRemoved - called once the pack is gone. Must be stable — an effect depends on it.
 */
export function useLibraryRemoval(id: DatapackId, onRemoved?: () => void): LibraryRemoval {
    const remove = useDataInstallerRequest<{ deleted?: boolean }>('delete-library-datapack');
    const run = remove.load;
    const start = useCallback((): void => {
        run({ datapackName: id.name, version: id.version, confirm: true });
    }, [run, id.name, id.version]);

    const removed = remove.value?.deleted === true;
    useEffect(() => {
        if (removed) onRemoved?.();
    }, [removed, onRemoved]);

    let note: React.JSX.Element | null = null;
    if (removed) note = <p className="datapack-export-note">Removed from the library.</p>;
    else if (remove.failure) note = <p className="datapack-export-note">It could not be removed: {remove.failure.message}</p>;
    return { start, removing: remove.loading, removed, note };
}

export interface RemoveFromLibraryButtonProps {
    id: DatapackId;
    /** Called once the pack is gone. Must be stable — an effect depends on it. */
    onRemoved?: () => void;
}

export function RemoveFromLibraryButton({ id, onRemoved }: RemoveFromLibraryButtonProps): React.JSX.Element {
    const { start, removing, removed, note } = useLibraryRemoval(id, onRemoved);
    if (removed) return <>{note}</>;
    return (
        <div className="datapack-save-file">
            {/* Spectrum's busy button, not a "-ing" label (owner, 2026-10-31). */}
            <Button variant="secondary" onPress={start} isPending={removing}>
                Remove it from the library
            </Button>
            {note}
        </div>
    );
}
