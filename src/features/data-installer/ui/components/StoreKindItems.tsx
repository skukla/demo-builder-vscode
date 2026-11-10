/**
 * One kind's items to select, or why they could not be listed (`StoreItemsStage`).
 *
 * The screen keeps its kinds and buttons while the store is read (a slow read must not cost what is
 * already selected), so the wait sits in the pane, in the house rows: "Reading categories", from
 * Commerce (owner, 2026-11-08, F79: a bare spinner said nothing). A kind with nothing to select
 * never rests here: the flow moves on to the next kind, and its row is greyed out.
 *
 * Its notes sit under the list, so the filter, count and Select All are in the same place on every
 * kind, whichever ones have a note (owner, 2026-11-02).
 *
 * @module features/data-installer/ui/components/StoreKindItems
 */

import React from 'react';
import { KIND_NOUNS, type PickableKind, type StoreItemPage } from '../../pickableKinds';
import { StoreItemChecklist } from './StoreItemChecklist';
import { StageWait } from '@/core/ui/components/feedback/StageWait';
import { readingKind } from '@/core/utils/waitStages';

/** What selecting one of these also saves, on the kinds where the SC needs to know. */
const INCLUDES: Partial<Record<PickableKind, string>> = {
    products: 'Includes related categories, attributes and stock.',
    cart_rules: 'Includes related coupons.',
    b2b_companies: 'Includes the company admin.',
};

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
                <StageWait key={kind} lines={readingKind(many)} />
            </div>
        );
    }
    if (failure || !page) return <p className="dialog-problem text-negative">Couldn&apos;t load {many}: {failure}</p>;
    return (
        <>
            <StoreItemChecklist items={page.items} nouns={[one, many]} picked={picked} onChange={onChange} />
            {INCLUDES[kind] ? <p className="datapack-export-note">{INCLUDES[kind]}</p> : null}
        </>
    );
}
