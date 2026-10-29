/**
 * "Remove it from the library" — delete one of the SC's own library packs.
 *
 * Shown in two places, both where it is safe by construction:
 * - after a load that CREATED the pack, where it is an exact undo (a load that
 *   updated an existing pack is not offered it: deleting would also remove what
 *   the pack held before);
 * - in the flyout of a library pack the SC owns.
 *
 * The library itself only lets a pack's owner delete it, so a stale `mine` cannot
 * remove anyone else's pack. Nothing here ever deletes from the Data Installer.
 *
 * A pack this SC shared in a project file (datapack-engine step 07) asks first, with the
 * warning `get-datapack-detail` carries: anyone who has not created that project yet gets
 * the pack it was made from instead. Without one, the one press removes it, as it always did.
 *
 * @module features/data-installer/ui/components/RemoveFromLibraryButton
 */

import { Button } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useState } from 'react';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import type { DatapackId } from '@/types/datapack';

export interface RemoveFromLibraryButtonProps {
    id: DatapackId;
    /** Called once the pack is gone. Must be stable — an effect depends on it. */
    onRemoved?: () => void;
    /** Shown before removing, which then takes a second press. */
    warning?: string;
}

export function RemoveFromLibraryButton({
    id,
    onRemoved,
    warning,
}: RemoveFromLibraryButtonProps): React.JSX.Element {
    const [asking, setAsking] = useState(false);
    const remove = useDataInstallerRequest<{ deleted?: boolean }>('delete-library-datapack');
    const run = remove.load;
    const start = useCallback((): void => {
        run({ datapackName: id.name, version: id.version, confirm: true });
    }, [run, id.name, id.version]);

    const removed = remove.value?.deleted === true;
    useEffect(() => {
        if (removed) onRemoved?.();
    }, [removed, onRemoved]);

    if (removed) {
        return <p className="datapack-export-note">Removed from the library.</p>;
    }
    if (asking && warning) {
        return (
            <div className="datapack-save-file">
                <p className="datapack-export-note">{warning}</p>
                <Button variant="negative" onPress={start} isDisabled={remove.loading}>
                    {remove.loading ? 'Removing' : 'Remove'}
                </Button>
                <Button variant="secondary" onPress={() => setAsking(false)} isDisabled={remove.loading}>
                    Cancel
                </Button>
                {remove.failure ? <p className="datapack-export-note">It could not be removed: {remove.failure.message}</p> : null}
            </div>
        );
    }
    return (
        <div className="datapack-save-file">
            <Button variant="secondary" onPress={warning ? () => setAsking(true) : start} isDisabled={remove.loading}>
                {remove.loading ? 'Removing' : 'Remove it from the library'}
            </Button>
            {remove.failure ? (
                <p className="datapack-export-note">
                    It could not be removed: {remove.failure.message}
                </p>
            ) : null}
        </div>
    );
}
