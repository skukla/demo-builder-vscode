/**
 * The pick screen's list of one kind, or why there is none to show (`SaveFromStoreModal`).
 *
 * Choosing another kind re-reads the store with the dialog already showing, so it is not a wait for
 * the dialog: the spinner goes where the list lands, without words, and the rest stays (dialog design
 * rules). The dialog's first read is `Modal`'s own wait.
 *
 * @module features/data-installer/ui/components/StoreKindItems
 */

import React from 'react';
import { KIND_NOUNS, type PickableKind, type StoreItemPage } from '../../pickableKinds';
import { StoreItemChecklist } from './StoreItemChecklist';
import { Spinner } from '@/core/ui/components/ui/Spinner';

export interface StoreKindItemsProps {
    kind: PickableKind;
    page: StoreItemPage | null;
    failure?: string;
    loading: boolean;
    picked: string[];
    onChange: (ids: string[]) => void;
}

export function StoreKindItems({ kind, page, failure, loading, picked, onChange }: StoreKindItemsProps): React.ReactElement {
    const [one, many] = KIND_NOUNS[kind];
    if (loading || (!page && !failure)) {
        return (
            <div className="datapack-pick-wait">
                <Spinner size="S" aria-label={`Loading the store's ${many}`} />
            </div>
        );
    }
    if (failure || !page) return <p className="datapack-export-note">The store&apos;s {many} could not be listed: {failure}</p>;
    const held = page.inPackCount > 0 ? <p className="datapack-export-note">{page.inPackCount.toLocaleString('en-US')} more are in the pack already and are saved with it.</p> : null;
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
