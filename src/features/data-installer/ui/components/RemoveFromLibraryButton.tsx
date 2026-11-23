/**
 * Delete from My Datapacks: the file load's one Delete (`RemoveFromLibraryButton`) and the flyout's
 * Delete (`useLibraryRemoval`), both where it is safe by construction:
 * - after a file load, the result's one Delete (step-07 F2, P4-Q7) removes exactly what that load
 *   created, the datapack and any settings layer, each by its own id, on the one press. Each delete
 *   keeps the library's layer of the same version (`keepSettingsLayer`): a layer that was there
 *   before the load is not the load's to remove (owner rule 1). A retry after a partial failure
 *   sends only what is left. A pack the load updated is never offered here, since deleting would
 *   also remove what it held before;
 * - in the flyout of a library pack the SC owns, the menu's Delete (`PackActions`, through
 *   `useLibraryRemoval`). It asks there first, with the warning `get-datapack-detail` carries when
 *   this SC shared the pack in a project file.
 *
 * The library itself only lets a pack's owner delete it, so a stale `mine` cannot
 * remove anyone else's pack. Nothing here ever deletes from the Data Installer.
 *
 * @module features/data-installer/ui/components/RemoveFromLibraryButton
 */

import { Button } from '@adobe/react-spectrum';
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import { useIsMounted } from '@/core/ui/hooks/useIsMounted';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { DatapackId } from '@/types/datapack';
import type { HandlerResponse } from '@/types/handlers';

/** A library pack's removal: start it, whether it is running or done, and the line saying so. */
export interface LibraryRemoval {
    start: () => void;
    removing: boolean;
    removed: boolean;
    /** "Deleted.", or why it could not be; nothing before it runs. */
    note: React.JSX.Element | null;
}

/**
 * Remove one of the SC's own library packs, confirmed (the caller has asked when it needed to).
 *
 * @param onRemoved - called once the pack is gone. Must be stable — an effect depends on it.
 * @param everyVersion - remove every version of the pack, not only `id`'s (a pack of saves)
 */
export function useLibraryRemoval(id: DatapackId, onRemoved?: () => void, everyVersion = false): LibraryRemoval {
    const remove = useDataInstallerRequest<{ deleted?: boolean }>('delete-library-datapack');
    const run = remove.load;
    const start = useCallback((): void => {
        run({ datapackName: id.name, ...(everyVersion ? { everyVersion: true } : { version: id.version }), confirm: true });
    }, [run, id.name, id.version, everyVersion]);

    const removed = remove.value?.deleted === true;
    // Before the paint: the flyout goes from this wait to closing, or its reload, with nothing between.
    useLayoutEffect(() => {
        if (removed) onRemoved?.();
    }, [removed, onRemoved]);
    return { start, removing: remove.loading, removed, note: removalNote(removed, remove.failure?.message) };
}

/** "Deleted.", or why it could not be; nothing before it runs. */
function removalNote(removed: boolean, problem: string | undefined): React.JSX.Element | null {
    if (removed) return <p className="datapack-export-note">Deleted.</p>;
    if (problem) return <p className="dialog-problem text-negative">It could not be deleted: {problem}</p>;
    return null;
}

/** Where an exact removal is: not started, running, done, or stopped with the library's reason. */
interface ExactState {
    removing: boolean;
    removed: boolean;
    problem?: string;
}

const NOT_STARTED: ExactState = { removing: false, removed: false };

/** What the SC reads when the library gave no answer, or no reason. */
const NO_ANSWER = 'My Datapacks did not answer. Close and try again.';

const keyOf = (id: DatapackId): string => `${id.name}@${id.version}`;

/**
 * Remove exactly these library packs, one after another, each without its same-version layer
 * (`keepSettingsLayer`): the ids name every layer to go. Stops at the first the library refuses;
 * pressed again, it skips those already removed, so a retry never asks for one already gone.
 *
 * @param ids - what to remove. Must be stable: the press reads it.
 */
function useExactRemoval(ids: readonly DatapackId[]): LibraryRemoval {
    const [state, setState] = useState<ExactState>(NOT_STARTED);
    const mounted = useIsMounted();
    const done = useRef(new Set<string>());
    const start = useCallback((): void => {
        setState({ removing: true, removed: false });
        void (async () => {
            for (const id of ids.filter((each) => !done.current.has(keyOf(each)))) {
                const payload = { datapackName: id.name, version: id.version, keepSettingsLayer: true, confirm: true };
                const answer = await webviewClient
                    .request<HandlerResponse>('delete-library-datapack', payload)
                    // No answer came back: transport words are not for the SC (the request's own failure).
                    .catch((): HandlerResponse => ({ success: false, error: NO_ANSWER }));
                if (!answer.success) {
                    if (mounted.current) setState({ removing: false, removed: false, problem: answer.error ?? NO_ANSWER });
                    return;
                }
                done.current.add(keyOf(id));
            }
            if (mounted.current) setState({ removing: false, removed: true });
        })();
    }, [ids, mounted]);
    return { start, removing: state.removing, removed: state.removed, note: removalNote(state.removed, state.problem) };
}

export interface RemoveFromLibraryButtonProps {
    /** Exactly what to remove, each by id (a datapack, and a settings layer the same load created). Must be stable. */
    ids: readonly DatapackId[];
}

export function RemoveFromLibraryButton({ ids }: RemoveFromLibraryButtonProps): React.JSX.Element {
    const { start, removing, removed, note } = useExactRemoval(ids);
    if (removed) return <>{note}</>;
    return (
        <div className="datapack-save-file">
            {/* Spectrum's busy button, not a "-ing" label (owner, 2026-10-31). */}
            <Button variant="secondary" onPress={start} isPending={removing}>
                Delete
            </Button>
            {note}
        </div>
    );
}
