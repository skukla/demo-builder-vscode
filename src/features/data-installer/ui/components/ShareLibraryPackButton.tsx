/**
 * Share / Stop sharing — one action in the flyout of the SC's own library pack (owner, 2026-10-30).
 *
 * Built as `RemoveFromLibraryButton` is, the house inline confirm: the first press asks, the
 * second does it, Cancel puts it back. Share asks with the owner's sentence ("Everyone with access
 * to the datapack library can see and install this pack."); Stop sharing asks the confirm alone.
 * Either sends `share-library-datapack`, confirmed, for every version of the pack. Not a sibling
 * of the Remove button's component on purpose: the two differ in label, wording and request, and
 * share only the three-state shape, which is two lines of state.
 *
 * @module features/data-installer/ui/components/ShareLibraryPackButton
 */

import { Button } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useState } from 'react';
import { SHARE_CONSENT } from '../../shareWording';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import type { DatapackId } from '@/types/datapack';

export interface ShareLibraryPackButtonProps {
    id: DatapackId;
    /** Whether the pack is shared now: the action reads Stop sharing when it is. */
    shared: boolean;
    /** Called once the library has changed it. Must be stable: an effect depends on it. */
    onChanged?: () => void;
}

export function ShareLibraryPackButton({ id, shared, onChanged }: ShareLibraryPackButtonProps): React.JSX.Element {
    const [asking, setAsking] = useState(false);
    const request = useDataInstallerRequest<{ shared?: boolean }>('share-library-datapack');
    const run = request.load;
    const label = shared ? 'Stop sharing' : 'Share';
    const confirm = useCallback((): void => {
        setAsking(false);
        run({ datapackName: id.name, shared: !shared, confirm: true });
    }, [run, id.name, shared]);

    const changed = request.value;
    useEffect(() => {
        if (changed) onChanged?.();
    }, [changed, onChanged]);

    const failure = request.failure ? <p className="datapack-export-note">It could not be changed: {request.failure.message}</p> : null;
    if (asking) {
        return (
            <div className="datapack-save-file">
                {shared ? null : <p className="datapack-export-note">{SHARE_CONSENT}</p>}
                <Button variant={shared ? 'secondary' : 'accent'} onPress={confirm} isDisabled={request.loading}>
                    {label}
                </Button>
                <Button variant="secondary" onPress={() => setAsking(false)} isDisabled={request.loading}>
                    Cancel
                </Button>
                {failure}
            </div>
        );
    }
    return (
        <div className="datapack-save-file">
            <Button variant="secondary" onPress={() => setAsking(true)} isDisabled={request.loading}>
                {label}
            </Button>
            {failure}
        </div>
    );
}
