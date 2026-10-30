/**
 * Share / Stop sharing — the confirmation the flyout's menu row opens, for the SC's own library
 * pack (owner, 2026-10-30). The house inline confirm: the menu row asks, the button here does it,
 * Cancel puts it back. Share asks with the owner's sentence ("Everyone with access to the
 * datapack library can see and install this pack."); Stop sharing asks the confirm alone. Either
 * sends `share-library-datapack`, confirmed, for every version of the pack.
 *
 * It was a button in the flyout that asked on its first press; the first press is the menu row
 * now (`PackActions`), so this is only the second. Not shared with Remove's confirm on purpose:
 * the two differ in label, wording and request.
 *
 * @module features/data-installer/ui/components/ShareLibraryPackConfirm
 */

import { Button } from '@adobe/react-spectrum';
import React, { useCallback, useEffect } from 'react';
import { SHARE_CONSENT } from '../../shareWording';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import type { DatapackId } from '@/types/datapack';

export interface ShareLibraryPackConfirmProps {
    id: DatapackId;
    /** Whether the pack is shared now: the confirm then reads Stop sharing. */
    shared: boolean;
    /** Called once the library has changed it. Must be stable: an effect depends on it. */
    onChanged?: () => void;
    /** Cancelled, or done: the flyout puts its actions back. Must be stable. */
    onDone: () => void;
}

export function ShareLibraryPackConfirm({ id, shared, onChanged, onDone }: ShareLibraryPackConfirmProps): React.JSX.Element {
    const request = useDataInstallerRequest<{ shared?: boolean }>('share-library-datapack');
    const run = request.load;
    const label = shared ? 'Stop sharing' : 'Share';
    const confirm = useCallback((): void => {
        run({ datapackName: id.name, shared: !shared, confirm: true });
    }, [run, id.name, shared]);

    const changed = request.value;
    useEffect(() => {
        if (!changed) return;
        onChanged?.();
        onDone();
    }, [changed, onChanged, onDone]);

    return (
        <div className="datapack-save-file">
            {shared ? null : <p className="datapack-export-note">{SHARE_CONSENT}</p>}
            <Button variant={shared ? 'secondary' : 'accent'} onPress={confirm} isDisabled={request.loading}>
                {label}
            </Button>
            <Button variant="secondary" onPress={onDone} isDisabled={request.loading}>
                Cancel
            </Button>
            {request.failure ? <p className="datapack-export-note">It could not be changed: {request.failure.message}</p> : null}
        </div>
    );
}
