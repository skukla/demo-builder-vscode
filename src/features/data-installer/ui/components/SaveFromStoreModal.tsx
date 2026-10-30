/**
 * The pick screen ("Choose what goes in the pack"): save from this project's Commerce instance into the demo's own pack, picking what goes in (datapack-engine step 14,
 * items 10 and 11). The Commerce pack with Demo Builder's engine: "Create datapack"
 * (`CreateDatapackModal`) opens this instead of the service's export form, and "Save store
 * changes to this pack" opens it too, with the pack, so the SC can add what they made by hand in
 * the Admin.
 *
 * One kind at a time, chosen from a `Picker` (as the import form chooses a website), its items
 * listed by `list-datapack-export-items` less what the pack holds already. Picks are kept across
 * kinds; Save hands them to `onSave`, which starts the save in the screen's progress window
 * (`useSaveStoreChanges`), so this modal closes rather than showing a result.
 *
 * What a picked thing brings with it (a product's categories, set, attributes and quantities; a
 * rule's coupons; a company's admin) is said once, under the list, rather than per row.
 *
 * @module features/data-installer/ui/components/SaveFromStoreModal
 */

import { DialogContainer, Item, Picker } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useState } from 'react';
import { KIND_NOUNS, PICKABLE_KINDS, type PickableKind, type StoreItemPage, type StorePicks, isPickableKind, pickCount } from '../../pickableKinds';
import { dataTypeLabel } from '../dataTypeLabel';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import { StoreItemChecklist } from './StoreItemChecklist';
import { Modal } from '@/core/ui/components/ui/Modal';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

/** The pack being saved, when the save is of one Demo Builder installed. */
export interface PackBeingSaved {
    id: DatapackId;
    displayName: string;
    source: DatapackStoreName;
}

export interface SaveFromStoreModalProps {
    onClose: () => void;
    /** Start the save with these picks. */
    onSave: (picks: StorePicks) => void;
    pack?: PackBeingSaved;
}

function intro(pack: PackBeingSaved | undefined): string {
    if (pack) {
        return `Saves this store's copy of ${pack.displayName} as a new version of this demo's own pack. Also pick anything you added in the Admin that it does not hold yet.`;
    }
    return "Saves what you pick from this store as a new version of this demo's own pack. A picked product brings its categories, attribute set, attributes and quantities; a cart rule its coupons; a company its admin.";
}

/** The list of one kind, or why there is none to show. */
function KindItems({ kind, page, failure, loading, picked, onChange }: { kind: PickableKind; page: StoreItemPage | null; failure?: string; loading: boolean; picked: string[]; onChange: (ids: string[]) => void }): React.ReactElement {
    const [one, many] = KIND_NOUNS[kind];
    if (failure) return <p className="datapack-export-note">The store&apos;s {many} could not be listed: {failure}</p>;
    if (loading || !page) return <p className="datapack-export-note">Loading the store&apos;s {many}</p>;
    const held = page.inPackCount > 0 ? <p className="datapack-export-note">{page.inPackCount} more are in the pack already and are saved with it.</p> : null;
    if (page.items.length === 0) {
        return <>{held ?? <p className="datapack-export-note">This store has no {many} of its own to pick.</p>}</>;
    }
    return (
        <>
            <StoreItemChecklist items={page.items} nouns={[one, many]} picked={picked} onChange={onChange} />
            {held}
        </>
    );
}

export function SaveFromStoreModal({ onClose, onSave, pack }: SaveFromStoreModalProps): React.JSX.Element {
    const [kind, setKind] = useState<PickableKind>('products');
    const [picks, setPicks] = useState<StorePicks>({});
    const list = useDataInstallerRequest<StoreItemPage>('list-datapack-export-items');
    const load = list.load;
    useEffect(() => {
        load({ dataType: kind, ...(pack ? { datapackName: pack.id.name, version: pack.id.version, source: pack.source } : {}) });
    }, [load, kind, pack]);

    const choose = useCallback((key: React.Key | null): void => {
        const next = String(key ?? '');
        if (isPickableKind(next)) setKind(next);
    }, []);
    const pickKind = useCallback((ids: string[]): void => setPicks((current) => ({ ...current, [kind]: ids })), [kind]);
    const count = pickCount(picks);
    const save = useCallback((): void => onSave(picks), [onSave, picks]);

    return (
        <DialogContainer onDismiss={onClose}>
            <Modal
                size="L"
                wide
                title="Choose what goes in the pack"
                onClose={onClose}
                closeLabel="Close"
                actionButtons={[{ label: count > 0 ? `Save with ${count} picked` : 'Save', variant: 'accent', onPress: save, isDisabled: !pack && count === 0 }]}
            >
                <div className="datapack-export-body">
                    <p className="datapack-export-intro">{intro(pack)}</p>
                    <Picker label="Pick from" selectedKey={kind} onSelectionChange={choose}>
                        {PICKABLE_KINDS.map((each) => {
                            const n = picks[each]?.length ?? 0;
                            const label = n > 0 ? `${dataTypeLabel(each)} (${n} picked)` : dataTypeLabel(each);
                            return <Item key={each} textValue={label}>{label}</Item>;
                        })}
                    </Picker>
                    <KindItems kind={kind} page={list.value} failure={list.failure?.message} loading={list.loading || !list.settled} picked={picks[kind] ?? []} onChange={pickKind} />
                </div>
            </Modal>
        </DialogContainer>
    );
}
