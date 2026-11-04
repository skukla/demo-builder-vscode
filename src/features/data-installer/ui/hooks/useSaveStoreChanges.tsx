/**
 * Save Changes, from the demo's own pack's flyout, and Create Datapack, from the header
 * (`.rptc/plans/datapack-save-as/`): the pick screen that opens first (`SaveFromStoreModal`, with a
 * new pack's name first), the request that starts the save, and the house progress window that
 * follows it
 * (`OperationProgressModal`, through `useOperationRunner`, as the projects list and the dashboard
 * host theirs).
 *
 * The catalog view mounts both beside its flyout, as it mounts the import modal: a dialog inside
 * the drawer is the shape this screen rejected. The window ends on the save's one sentence. The
 * catalog is read again the moment the save finishes, not when the window closes: the library
 * read takes seconds, and on Close the screen sat unchanged until the pack popped in (owner,
 * 2026-11-04). A save sent to the background still reads it when it finishes, since this screen
 * keeps listening after its window closes.
 *
 * @module features/data-installer/ui/hooks/useSaveStoreChanges
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { type StorePicks, pickCount, selectionsOf } from '../../pickableKinds';
import type { PackBeingSaved } from '../components/create-flow/datapackFlowStages';
import { SaveFromStoreModal } from '../components/SaveFromStoreModal';
import { OperationProgressModal } from '@/core/ui/components/feedback/OperationProgressModal';
import { useOperationProgress } from '@/core/ui/hooks/useOperationProgress';
import { useOperationRunner } from '@/core/ui/hooks/useOperationRunner';
import { DATAPACK_SAVE_OPERATION_ID } from '@/core/utils/operationIds';
import type { SaveStoreChangesRequest } from '@/types/webviewRequests';

/** The save's start, and the windows to mount. */
export interface SaveStoreChanges {
    /** Save: open the pick screen for the demo's pack, which is the SC's. */
    offer: (pack: PackBeingSaved) => void;
    /** Save As: open the name and pick screens; `pack` is what the store holds, when Demo Builder installed one. */
    offerSaveAs: (suggestedName: string, pack?: PackBeingSaved) => void;
    /** The pick screen and the progress window; mount once, beside the flyout. */
    windows: React.JSX.Element;
}

/** What the open pick screen is for. */
interface Offer {
    pack?: PackBeingSaved;
    /** Save As's starting name; absent for Save. */
    saveAsName?: string;
}

/** The request a save sends: the pack when there is one, the picks when there are any, and the name. */
function requestOf(pack: PackBeingSaved | undefined, picks: StorePicks, saveAsName: string | undefined): Omit<SaveStoreChangesRequest, 'progress'> {
    return {
        ...(pack ? { datapackName: pack.id.name, version: pack.id.version, source: pack.source } : {}),
        ...(pickCount(picks) > 0 ? { selections: selectionsOf(picks) } : {}),
        ...(saveAsName ? { saveAs: { displayName: saveAsName } } : {}),
        confirm: true,
    };
}

/**
 * @param onSaved - called once per save, when it finishes, to read the catalog again. Must be stable.
 */
export function useSaveStoreChanges(onSaved: () => void): SaveStoreChanges {
    const { start, open, retry, close } = useOperationRunner();
    const [offered, setOffered] = useState<Offer | undefined>(undefined);
    // The save's own progress, followed by the house hook (as the Updates window follows its run),
    // whether or not its window is open: counted per save, so each finishes once.
    const [run, setRun] = useState(0);
    const progress = useOperationProgress(run > 0 ? DATAPACK_SAVE_OPERATION_ID : null, run, false);
    const reread = useRef(0);
    useEffect(() => {
        if (progress?.state !== 'succeeded' || reread.current === run) return;
        reread.current = run;
        onSaved();
    }, [progress, run, onSaved]);

    const offer = useCallback((pack: PackBeingSaved): void => setOffered({ pack }), []);
    const offerSaveAs = useCallback(
        (suggestedName: string, pack?: PackBeingSaved): void => setOffered({ saveAsName: suggestedName, ...(pack ? { pack } : {}) }),
        [],
    );
    const closeOffer = useCallback((): void => setOffered(undefined), []);

    const save = useCallback(
        (picks: StorePicks, saveAsName?: string): void => {
            const pack = offered?.pack;
            setOffered(undefined);
            setRun((n) => n + 1);
            // The window names the pack: the one saved into, or the one Save As makes.
            const name = saveAsName ?? pack?.displayName ?? 'Datapack';
            start({
                id: DATAPACK_SAVE_OPERATION_ID,
                name,
                message: 'save-store-changes-to-pack',
                payload: { ...requestOf(pack, picks, saveAsName) },
                title: saveAsName ? `Creating ${name}` : `Saving ${name}`,
                failureTitle: saveAsName ? `Couldn't Create ${name}` : `Couldn't Save ${name}`,
                successTitle: saveAsName ? 'Datapack Created' : 'Datapack Saved',
            });
        },
        [start, offered],
    );

    const windows = (
        <>
            {offered ? <SaveFromStoreModal pack={offered.pack} saveAsName={offered.saveAsName} onSave={save} onClose={closeOffer} /> : null}
            <OperationProgressModal operation={open} onRetry={retry} onClose={close} />
        </>
    );
    return { offer, offerSaveAs, windows };
}
