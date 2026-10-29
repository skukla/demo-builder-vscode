/**
 * "Save store changes to this pack" from the catalog (datapack-engine step 05): the request that
 * starts it, and the house progress window that follows it (`OperationProgressModal`, through
 * `useOperationRunner`, as the projects list and the dashboard host theirs).
 *
 * The catalog view mounts the window beside its flyout, as it mounts the import modal: a
 * dialog inside the drawer is the shape this screen rejected. The window ends on the save's
 * one sentence; closing it tells the catalog to read again, since a new version of the pack is
 * now in the library and the project holds it.
 *
 * @module features/data-installer/ui/hooks/useSaveStoreChanges
 */

import React, { useCallback } from 'react';
import { OperationProgressModal } from '@/core/ui/components/feedback/OperationProgressModal';
import { useOperationRunner } from '@/core/ui/hooks/useOperationRunner';
import { DATAPACK_SAVE_OPERATION_ID } from '@/core/utils/operationIds';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';
import type { SaveStoreChangesRequest } from '@/types/webviewRequests';

/** The save's start, and the window to mount. */
export interface SaveStoreChanges {
    /** Start saving the store's copy of this pack, held in this store. */
    save: (id: DatapackId, displayName: string, source: DatapackStoreName) => void;
    /** The progress window; mount it once, beside the flyout. */
    progressWindow: React.JSX.Element;
}

/**
 * @param onClosed - called when the window closes, to read the catalog again. Must be stable.
 */
export function useSaveStoreChanges(onClosed: () => void): SaveStoreChanges {
    const { start, open, retry, close } = useOperationRunner();

    const save = useCallback(
        (id: DatapackId, displayName: string, source: DatapackStoreName): void => {
            const payload: Omit<SaveStoreChangesRequest, 'progress'> = { datapackName: id.name, version: id.version, source, confirm: true };
            start({
                id: DATAPACK_SAVE_OPERATION_ID,
                name: id.name,
                message: 'save-store-changes-to-pack',
                payload: { ...payload },
                title: 'Saving store changes',
                subject: displayName,
                failureTitle: "Couldn't save the store changes",
                successTitle: 'Store changes saved',
            });
        },
        [start],
    );

    const closeWindow = useCallback((): void => {
        close();
        onClosed();
    }, [close, onClosed]);

    return { save, progressWindow: <OperationProgressModal operation={open} onRetry={retry} onClose={closeWindow} /> };
}
