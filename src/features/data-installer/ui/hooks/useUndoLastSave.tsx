/**
 * Undo Last Save on the demo's own datapack (Phase 2, owner 2026-11-12): the flyout has asked
 * (`PackActions`), so the request is sent confirmed. The `undo-last-save` handler starts one job that
 * uninstalls the newest save and installs the one before it, answering as `start-datapack-import`
 * does. Once it is accepted, the import window opens on the earlier save, where it picks the running
 * job up (`DatapackJobWindow`). It is `useLibrarySharing`'s shape, for the same flyout.
 *
 * @module features/data-installer/ui/hooks/useUndoLastSave
 */

import React, { useCallback, useLayoutEffect, useRef } from 'react';
import { useDataInstallerRequest } from './useDataInstallerRequest';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { DatapackId } from '@/types/datapack';
import type { UndoLastSaveRequest, UndoLastSaveResult } from '@/types/webviewRequests';

const UNDO_START = { timeout: TIMEOUTS.DATAPACK_UNDO_START };

/** The undo: start it, whether it is starting, and why it could not. */
export interface UndoLastSave {
    start: () => void;
    working: boolean;
    /** Why it could not be started; nothing otherwise. */
    note: React.JSX.Element | null;
}

/**
 * Undo the last save of the demo's datapack.
 *
 * @param name - the datapack's library name
 * @param undoTo - the save it goes back to, when there is one
 * @param onStarted - opens the run on that save. Must be stable: an effect depends on it
 * @returns the undo
 */
export function useUndoLastSave(
    name: string,
    undoTo: string | undefined,
    onStarted?: (id: DatapackId) => void,
): UndoLastSave {
    const request = useDataInstallerRequest<UndoLastSaveResult>('undo-last-save', UNDO_START);
    // The save it goes back to, as it was when the SC pressed Undo: the catalog re-reads after.
    const goingTo = useRef<DatapackId | undefined>(undefined);
    const run = request.load;
    const start = useCallback((): void => {
        goingTo.current = undoTo ? { name, version: undoTo } : undefined;
        const payload: UndoLastSaveRequest = { datapackName: name, confirm: true };
        run(payload);
    }, [run, name, undoTo]);

    // Before the paint: the flyout goes from this wait to the run's window with nothing between them.
    const started = request.value;
    useLayoutEffect(() => {
        const to = goingTo.current;
        if (!started || !to) return;
        goingTo.current = undefined;
        onStarted?.(to);
    }, [started, onStarted]);

    const note = request.failure ? (
        <p className="dialog-problem text-negative">The last save couldn&rsquo;t be undone: {request.failure.message}</p>
    ) : null;
    return { start, working: request.loading, note };
}
