/**
 * The save windows the Datapacks screen opens, the request each starts, and the house progress window
 * that follows it (`OperationProgressModal`, through `useOperationRunner`, as the projects list and
 * the dashboard host theirs):
 *
 * | Opened by | Window | Ends on |
 * |---|---|---|
 * | Save, on the SC's own datapack | `SaveChangesWindow` ("Save Changes to My Luma") | "Saved to My Luma" |
 * | Save As New, on any datapack | `SaveAsNewWindow` ("Save As New Datapack") | "Saved as Luma Holiday" |
 * | Create, with no datapack | the create flow (`DatapackFlowDialog`, step-04 S3 reshapes it) | "Luma Holiday Created" |
 *
 * (step-04 S2; decisions Phase 7b, J3-1.) A save from a datapack sends no picks: it takes everything
 * the demo uses (Add Unused Items removed, overview 7b, 2026-11-10); only Create picks.
 *
 * The catalog view mounts the windows beside its flyout, as it mounts the import modal: a dialog
 * inside the drawer is the shape this screen rejected. The catalog is read again the moment the save
 * finishes, not when the window closes: the library read takes seconds, and on Close the screen sat
 * unchanged until the pack popped in (owner, 2026-11-04). A save sent to the background still reads
 * it when it finishes, since this screen keeps listening after its window closes.
 *
 * @module features/data-installer/ui/hooks/useSaveStoreChanges
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { type StorePicks, selectionsOf } from '../../pickableKinds';
import { DatapackFlowDialog } from '../components/create-flow/DatapackFlowDialog';
import type { PackBeingSaved } from '../components/save/packBeingSaved';
import { SaveAsNewWindow } from '../components/save/SaveAsNewWindow';
import { SaveChangesWindow } from '../components/save/SaveChangesWindow';
import { OperationProgressModal } from '@/core/ui/components/feedback/OperationProgressModal';
import { useOperationProgress } from '@/core/ui/hooks/useOperationProgress';
import { type StartableOperation, useOperationRunner } from '@/core/ui/hooks/useOperationRunner';
import { DATAPACK_SAVE_OPERATION_ID } from '@/core/utils/operationIds';
import type { SaveStoreChangesRequest } from '@/types/webviewRequests';

/** The save's starts, and the windows to mount. */
export interface SaveStoreChanges {
    /** Create: the create flow, for a demo with no datapack. Stable. */
    create: () => void;
    /** Save: "Save Changes to My Luma", into the SC's own datapack. Stable. */
    save: (pack: PackBeingSaved) => void;
    /** Save As New: its form, the name starting as given. Stable. */
    saveAsNew: (pack: PackBeingSaved, startName: string) => void;
    /** The open window and the progress window; mount once, beside the flyout. */
    windows: React.JSX.Element;
}

/** Which window is open. */
type Offer = { kind: 'create' } | { kind: 'save'; pack: PackBeingSaved } | { kind: 'as-new'; pack: PackBeingSaved; startName: string };

/** The request a save sends: the datapack it starts from, or the picks, and the new name. */
type SaveBody = Omit<SaveStoreChangesRequest, 'progress'>;

/** How a run ends: into the datapack, as a new one, or a datapack created from picks. */
type Ending = 'into' | 'as-new' | 'create';

/** The run, its request and its words; the result names the datapack (owner, 2026-11-10; J3-1). */
function runOf(name: string, payload: SaveBody, ending: Ending): StartableOperation {
    const run = { id: DATAPACK_SAVE_OPERATION_ID, name, message: 'save-store-changes-to-pack', payload: { ...payload } };
    if (ending === 'create') return { ...run, title: `Creating ${name}`, failureTitle: `Couldn't Create ${name}`, successTitle: `${name} Created` };
    if (ending === 'as-new') return { ...run, title: `Saving ${name}`, failureTitle: `Couldn't Save ${name}`, successTitle: `Saved as ${name}` };
    return { ...run, title: `Saving ${name}`, failureTitle: `Couldn't Save ${name}`, successTitle: `Saved to ${name}` };
}

/** What a save from a datapack sends: the datapack, in its store, confirmed. */
const packFields = (pack: PackBeingSaved): SaveBody => ({ datapackName: pack.id.name, version: pack.id.version, source: pack.source, confirm: true });

/** What Create sends: the picks, and the new datapack's name. */
function createBody(picks: StorePicks, name: string): SaveBody {
    return { selections: selectionsOf(picks), saveAs: { displayName: name }, confirm: true };
}

/** Counts each save, and reads the catalog again once per save that succeeds. */
function useSavedOnce(onSaved: () => void): () => void {
    const [run, setRun] = useState(0);
    const progress = useOperationProgress(run > 0 ? DATAPACK_SAVE_OPERATION_ID : null, run, false);
    const reread = useRef(0);
    useEffect(() => {
        if (progress?.state !== 'succeeded' || reread.current === run) return;
        reread.current = run;
        onSaved();
    }, [progress, run, onSaved]);
    return useCallback(() => setRun((n) => n + 1), []);
}

/**
 * @param onSaved - called once per save, when it finishes, to read the catalog again. Must be stable.
 * @param ownNames - the SC's own datapacks' names, which Save As New refuses. Must be stable.
 */
export function useSaveStoreChanges(onSaved: () => void, ownNames: readonly string[]): SaveStoreChanges {
    const { start, open, retry, close } = useOperationRunner();
    const [offered, setOffered] = useState<Offer | undefined>(undefined);
    const next = useSavedOnce(onSaved);
    const create = useCallback((): void => setOffered({ kind: 'create' }), []);
    const save = useCallback((pack: PackBeingSaved): void => setOffered({ kind: 'save', pack }), []);
    const saveAsNew = useCallback((pack: PackBeingSaved, startName: string): void => setOffered({ kind: 'as-new', pack, startName }), []);
    const closeOffer = useCallback((): void => setOffered(undefined), []);

    const begin = useCallback(
        (name: string, payload: SaveBody, ending: Ending): void => {
            setOffered(undefined);
            next();
            start(runOf(name, payload, ending));
        },
        [start, next],
    );
    // Create names the datapack first, so its name is always there.
    const created = useCallback((picks: StorePicks, name = ''): void => begin(name, createBody(picks, name), 'create'), [begin]);

    const windows = (
        <>
            {offered?.kind === 'create' ? <DatapackFlowDialog title="Create Datapack" saveAsName="" onClose={closeOffer} onSave={created} /> : null}
            {offered?.kind === 'save' ? <SaveChangesWindow pack={offered.pack} onSave={() => begin(offered.pack.displayName, packFields(offered.pack), 'into')} onClose={closeOffer} /> : null}
            {offered?.kind === 'as-new' ? (
                <SaveAsNewWindow
                    startName={offered.startName}
                    ownNames={ownNames}
                    onSave={(name) => begin(name, { ...packFields(offered.pack), saveAs: { displayName: name } }, 'as-new')}
                    onClose={closeOffer}
                />
            ) : null}
            <OperationProgressModal operation={open} onRetry={retry} onClose={close} />
        </>
    );
    return { create, save, saveAsNew, windows };
}
