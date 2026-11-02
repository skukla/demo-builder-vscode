/**
 * One kind's items to pick, or why they could not be listed (`StoreItemsStage`).
 *
 * The screen keeps its Back and Save while the store is read (a slow read must not cost the picks
 * already made), so the spinner sits in the body, without words. A kind with nothing to pick never
 * rests here: the flow returns to the cards, where its card is greyed out.
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
    if (loading || (!page && !failure) || page?.items.length === 0) {
        return (
            <div className="modal-wait">
                <Spinner size="M" aria-label={`Loading the store's ${many}`} />
            </div>
        );
    }
    if (failure || !page) return <p className="datapack-export-note">The store&apos;s {many} could not be listed: {failure}</p>;
    return (
        <>
            <StoreItemChecklist items={page.items} nouns={[one, many]} picked={picked} onChange={onChange} />
            {page.inPackCount > 0 ? <p className="datapack-export-note">{page.inPackCount.toLocaleString('en-US')} more are in the pack already and are saved with it.</p> : null}
        </>
    );
}
