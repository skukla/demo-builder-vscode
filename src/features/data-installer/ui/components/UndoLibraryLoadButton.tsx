/**
 * "Remove it from the library" — the undo of a load that created a library pack.
 *
 * Offered only where it is an exact undo: the load just CREATED this pack in the
 * datapack library, so deleting it returns the library to where it was. A load that
 * updated an existing pack is not offered it — deleting would also remove what the
 * pack held before. The library itself only lets a pack's owner delete it.
 *
 * @module features/data-installer/ui/components/UndoLibraryLoadButton
 */

import { Button } from '@adobe/react-spectrum';
import React, { useCallback } from 'react';
import type { DatapackId } from '../../types';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';

export interface UndoLibraryLoadButtonProps {
    id: DatapackId;
}

export function UndoLibraryLoadButton({ id }: UndoLibraryLoadButtonProps): React.JSX.Element {
    const remove = useDataInstallerRequest<{ deleted?: boolean }>('delete-library-datapack');
    const run = remove.load;
    const start = useCallback((): void => {
        run({ datapackName: id.name, version: id.version, confirm: true });
    }, [run, id.name, id.version]);

    if (remove.value?.deleted) {
        return <p className="datapack-export-note">Removed from the library.</p>;
    }
    return (
        <div className="datapack-save-file">
            <Button variant="secondary" onPress={start} isDisabled={remove.loading}>
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
