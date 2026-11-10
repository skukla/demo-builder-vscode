/**
 * Share or Stop Sharing the SC's own library pack: every version of it, confirmed (the flyout has
 * asked, `PackActions`). It is `useLibraryRemoval`'s shape, for the same flyout.
 *
 * @module features/data-installer/ui/hooks/useLibrarySharing
 */

import React, { useCallback, useLayoutEffect } from 'react';
import { useDataInstallerRequest } from './useDataInstallerRequest';
import type { DatapackId } from '@/types/datapack';

/** A pack's sharing change: start it, whether it is running, and why it failed. */
export interface LibrarySharing {
    start: () => void;
    working: boolean;
    /** Why it could not be changed; nothing otherwise. */
    note: React.JSX.Element | null;
}

/**
 * Change whether the pack is shared.
 *
 * @param id - the pack
 * @param shared - whether it is shared now: the change is to the other
 * @param onChanged - called once the library has changed it. Must be stable: an effect depends on it
 * @returns the change
 */
export function useLibrarySharing(id: DatapackId, shared: boolean, onChanged?: () => void): LibrarySharing {
    const request = useDataInstallerRequest<{ shared?: boolean }>('share-library-datapack');
    const run = request.load;
    const start = useCallback((): void => {
        run({ datapackName: id.name, shared: !shared, confirm: true });
    }, [run, id.name, shared]);

    // Before the paint: the flyout goes from this wait to its reload with nothing between them.
    const changed = request.value;
    useLayoutEffect(() => {
        if (changed) onChanged?.();
    }, [changed, onChanged]);

    const note = request.failure ? (
        <p className="dialog-problem text-negative">{shared ? "Sharing couldn't be stopped" : "It couldn't be shared"}: {request.failure.message}</p>
    ) : null;
    return { start, working: request.loading, note };
}
