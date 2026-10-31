/**
 * "Create datapack" (owner, 2026-10-30): the header's one way to make a pack from this project's
 * Commerce instance, in place of "Export from this instance" and "Save from this store", which
 * overlapped (and a Commerce store is one level inside an instance).
 *
 * ONE dialog (owner, 2026-10-31, the multi-dialog audit): the pack type as two plain options at
 * the top and the chosen option's own form right under it, as the Share dialog does with its
 * link-or-file choice. No line under the choice: each form's opening sentence already says where
 * its pack goes, and a second line said it twice. It was a dialog that asked the type and
 * then closed for a second one. It rebuilds neither form; it hosts the one that already makes
 * that pack, with the choice as its lead:
 *
 * | Pack type | Engine         | The form under the choice                                                |
 * |-----------|----------------|--------------------------------------------------------------------------|
 * | Commerce  | Demo Builder's | the pick list (`SaveFromStoreDialog`), saved into this demo's own library pack by the catalog's save (`onSaveFromStore`, with its progress window) |
 * | Commerce  | the service's  | the service's export (`ServiceExportDialog`), into the shared catalog    |
 * | ACO       | either         | the ACO export (`ServiceExportDialog`), into the SC's library            |
 *
 * Both forms are L and wide, so the dialog keeps one width whichever is chosen. Switching the
 * choice starts that form afresh.
 *
 * @module features/data-installer/ui/components/CreateDatapackModal
 */

import { DialogContainer, Radio, RadioGroup } from '@adobe/react-spectrum';
import React, { useCallback, useState } from 'react';
import type { StorePicks } from '../../pickableKinds';
import { SaveFromStoreDialog } from './SaveFromStoreModal';
import { ServiceExportDialog } from './ServiceExportModal';

/** The two pack types. */
export type PackType = 'commerce' | 'aco';

const TITLE = 'Create a datapack';

export interface CreateDatapackModalProps {
    /** The engine chosen; the service's when absent, as the export was before Demo Builder's had one. */
    engine?: 'service' | 'demo-builder';
    onClose: () => void;
    /** Demo Builder's engine, Commerce: save the picks into this demo's own pack. */
    onSaveFromStore: (picks: StorePicks) => void;
}

/** The pack type, as two plain options (the Share dialog's shape). */
function PackTypeChoice({ packType, onChange }: {
    packType: PackType;
    onChange: (packType: PackType) => void;
}): React.JSX.Element {
    return (
        <RadioGroup
            label="Pack type"
            orientation="horizontal"
            value={packType}
            onChange={(value) => onChange(value === 'aco' ? 'aco' : 'commerce')}
        >
            <Radio value="commerce">Commerce datapack</Radio>
            <Radio value="aco">ACO datapack</Radio>
        </RadioGroup>
    );
}

export function CreateDatapackModal({ engine, onClose, onSaveFromStore }: CreateDatapackModalProps): React.JSX.Element {
    const [packType, setPackType] = useState<PackType>('commerce');
    const choice = <PackTypeChoice packType={packType} onChange={setPackType} />;
    const save = useCallback(
        (picks: StorePicks): void => {
            onClose();
            onSaveFromStore(picks);
        },
        [onClose, onSaveFromStore],
    );

    const picksFromStore = packType === 'commerce' && engine === 'demo-builder';
    return (
        <DialogContainer onDismiss={onClose}>
            {picksFromStore ? (
                <SaveFromStoreDialog title={TITLE} lead={choice} onSave={save} onClose={onClose} />
            ) : (
                <ServiceExportDialog key={packType} title={TITLE} lead={choice} packType={packType} onClose={onClose} />
            )}
        </DialogContainer>
    );
}
