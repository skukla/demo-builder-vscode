/**
 * What goes in a pack saved from the store: one card per pickable kind, in `PICKABLE_KINDS`' order.
 * Clicking a card opens that kind's items (`StoreItemsStage`); Back returns here with the count
 * updated.
 *
 * The cards show at once and stay clickable while the store's counts are read, and a count of none
 * greys its card out without moving anything. Only none is said: a number could not be trusted,
 * since a kind's list leaves off what the pack being saved holds, and cart rules and companies are
 * counted across the whole store (`storeItems.ts`). So a card with a count above none stays
 * clickable until its list has answered, and is greyed out from then on if nothing was left to pick.
 *
 * @module features/data-installer/ui/components/create-flow/stages/StoreKindsStage
 */

import React from 'react';
import { PICKABLE_KINDS, type PickableKind, type StoreItemPage, type StoreKindCounts, type StorePicks } from '../../../../pickableKinds';
import { dataTypeLabel } from '../../../dataTypeLabel';
import type { PackBeingSaved } from '../datapackFlowStages';
import { hasNothingToPick, isKnownEmpty, type KindReads } from '../useStorePicks';
import { ChoiceCard } from '@/features/project-creation/ui/components/ChoiceCard';

/** What a picked thing brings with it, on the cards where the SC needs to know. */
const BRINGS: Partial<Record<PickableKind, string>> = {
    products: 'Brings its categories, attribute set, attributes and quantities.',
    cart_rules: 'Brings its coupons.',
    b2b_companies: 'Brings its admin.',
};

export interface StoreKindsStageProps {
    pack?: PackBeingSaved;
    picks: StorePicks;
    reads: KindReads;
    counts: StoreKindCounts;
    onOpen: (kind: PickableKind) => void;
}

/** Why a card is greyed out, or how many are picked, or nothing. */
function noteOf(page: StoreItemPage | null | undefined, count: number | undefined, picked: number): string | undefined {
    if (page && hasNothingToPick(page)) {
        return page.inPackCount > 0 ? `${page.inPackCount.toLocaleString('en-US')} in the pack already` : 'None in this store';
    }
    if (isKnownEmpty(page, count)) return 'None in this store';
    return picked > 0 ? `${picked.toLocaleString('en-US')} picked` : undefined;
}

export function StoreKindsStage({ pack, picks, reads, counts, onOpen }: StoreKindsStageProps): React.ReactElement {
    return (
        <>
            {pack ? (
                <p className="datapack-export-intro">
                    Saves this store&apos;s copy of {pack.displayName} as a new version of this demo&apos;s own pack. Also pick anything you added in the Admin that it does not hold yet.
                </p>
            ) : null}
            <span className="datapack-import-label">What goes in it</span>
            <div className="datapack-flow-cards datapack-flow-cards--kinds">
                {PICKABLE_KINDS.map((kind) => {
                    const picked = picks[kind]?.length ?? 0;
                    const empty = isKnownEmpty(reads[kind], counts[kind]);
                    return (
                        <ChoiceCard
                            key={kind}
                            variant="compact"
                            name={dataTypeLabel(kind)}
                            description={empty ? undefined : BRINGS[kind]}
                            note={noteOf(reads[kind], counts[kind], picked)}
                            selected={picked > 0}
                            disabled={empty}
                            onSelect={() => onOpen(kind)}
                        />
                    );
                })}
            </div>
        </>
    );
}
