/**
 * "Save store changes to this pack", and "Save from this store", from the catalog (datapack-engine
 * step 05, step 14): the pick screen that opens first (`ExportDatapackModal` with Demo Builder's
 * engine), the request that starts the save, and the house progress window that follows it
 * (`OperationProgressModal`, through `useOperationRunner`, as the projects list and the dashboard
 * host theirs).
 *
 * The catalog view mounts both beside its flyout, as it mounts the import modal: a dialog inside
 * the drawer is the shape this screen rejected. The window ends on the save's one sentence;
 * closing it tells the catalog to read again, since a new version of the demo's pack is now in the
 * library.
 *
 * @module features/data-installer/ui/hooks/useSaveStoreChanges
 */

import React, { useCallback, useState } from 'react';
import { type StorePicks, pickCount, selectionsOf } from '../../pickableKinds';
import { ExportDatapackModal } from '../components/ExportDatapackModal';
import type { PackBeingSaved } from '../components/SaveFromStoreModal';
import { OperationProgressModal } from '@/core/ui/components/feedback/OperationProgressModal';
import { useOperationRunner } from '@/core/ui/hooks/useOperationRunner';
import { DATAPACK_SAVE_OPERATION_ID } from '@/core/utils/operationIds';
import type { SaveStoreChangesRequest } from '@/types/webviewRequests';

/** The save's start, and the windows to mount. */
export interface SaveStoreChanges {
    /** Open the pick screen: for the pack the project holds, or with none to save from the store alone. */
    offer: (pack?: PackBeingSaved) => void;
    /** The pick screen and the progress window; mount once, beside the flyout. */
    windows: React.JSX.Element;
}

/** What the open pick screen is for. */
interface Offer {
    pack?: PackBeingSaved;
}

/** The request a save sends: the pack when there is one, the picks when there are any. */
function requestOf(pack: PackBeingSaved | undefined, picks: StorePicks): Omit<SaveStoreChangesRequest, 'progress'> {
    return {
        ...(pack ? { datapackName: pack.id.name, version: pack.id.version, source: pack.source } : {}),
        ...(pickCount(picks) > 0 ? { selections: selectionsOf(picks) } : {}),
        confirm: true,
    };
}

/**
 * @param onClosed - called when the progress window closes, to read the catalog again. Must be stable.
 */
export function useSaveStoreChanges(onClosed: () => void): SaveStoreChanges {
    const { start, open, retry, close } = useOperationRunner();
    const [offered, setOffered] = useState<Offer | undefined>(undefined);

    const offer = useCallback((pack?: PackBeingSaved): void => setOffered(pack ? { pack } : {}), []);
    const closeOffer = useCallback((): void => setOffered(undefined), []);
    const pack = offered?.pack;

    const save = useCallback(
        (picks: StorePicks): void => {
            setOffered(undefined);
            start({
                id: DATAPACK_SAVE_OPERATION_ID,
                name: pack?.id.name ?? 'store',
                message: 'save-store-changes-to-pack',
                payload: { ...requestOf(pack, picks) },
                title: 'Saving store changes',
                subject: pack?.displayName ?? 'This store',
                failureTitle: "Couldn't save the store changes",
                successTitle: 'Store changes saved',
            });
        },
        [start, pack],
    );

    const closeWindow = useCallback((): void => {
        close();
        onClosed();
    }, [close, onClosed]);

    const windows = (
        <>
            {offered ? <ExportDatapackModal engine="demo-builder" pack={pack} onSave={save} onClose={closeOffer} /> : null}
            <OperationProgressModal operation={open} onRetry={retry} onClose={closeWindow} />
        </>
    );
    return { offer, windows };
}
