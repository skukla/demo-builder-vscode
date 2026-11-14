/**
 * Mark the SC's own library pack as a Demo Builder datapack, or take the mark off: every version of
 * it, confirmed (the flyout has asked, `PackActions`). The Datapack Library's More menu only (owner,
 * 2026-11-14; rule 1, reversibility). `useLibrarySharing`'s shape, for the same flyout.
 *
 * It calls the same handler as the agent tool `mark_demo_builder_datapack`. Agents cannot unmark: their
 * tool refuses `demoBuilder: false` before it dispatches, so this screen path is the only way to.
 *
 * @module features/data-installer/ui/hooks/useLibraryMarking
 */

import React, { useCallback, useLayoutEffect } from 'react';
import { useDataInstallerRequest } from './useDataInstallerRequest';
import type { DatapackId } from '@/types/datapack';

/** A pack's mark change: start it, whether it is running, and why it failed. */
export interface LibraryMarking {
    start: () => void;
    working: boolean;
    /** Why it could not be changed; nothing otherwise. */
    note: React.JSX.Element | null;
}

/**
 * Change whether the pack is a Demo Builder datapack.
 *
 * @param id - the pack
 * @param team - whether it is marked now: the change is to the other
 * @param onChanged - called once the store has changed it. Must be stable: an effect depends on it
 * @returns the change
 */
export function useLibraryMarking(
    id: DatapackId,
    team: boolean,
    onChanged?: () => void,
): LibraryMarking {
    const request = useDataInstallerRequest<{ demoBuilder?: boolean }>('mark-team-datapack');
    const run = request.load;
    const start = useCallback((): void => {
        run({ datapackName: id.name, demoBuilder: !team });
    }, [run, id.name, team]);

    // Before the paint: the flyout goes from this wait to its reload with nothing between them.
    const changed = request.value;
    useLayoutEffect(() => {
        if (changed) onChanged?.();
    }, [changed, onChanged]);

    const note = request.failure ? (
        <p className="dialog-problem text-negative">
            {team ? "The mark couldn't be removed" : "It couldn't be marked"}:{' '}
            {request.failure.message}
        </p>
    ) : null;
    return { start, working: request.loading, note };
}
