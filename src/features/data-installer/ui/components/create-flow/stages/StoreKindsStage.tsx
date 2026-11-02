/**
 * What goes in a pack saved from the store: one card per pickable kind, in `PICKABLE_KINDS`' order.
 * Clicking a card opens that kind's items (`StoreItemsStage`); Back returns here with the count
 * updated.
 *
 * Whether the store has any of a kind is known only once a read of it has answered: the handler
 * lists one kind at a time, whole, and reading all ten up front was not chosen (products and
 * customers would each be read in full twice, on every open). So a card stays clickable until its
 * read has answered, and is greyed out from then on when that answer left nothing to pick.
 *
 * @module features/data-installer/ui/components/create-flow/stages/StoreKindsStage
 */

import React from 'react';
import { PICKABLE_KINDS, type PickableKind, type StoreItemPage, type StorePicks } from '../../../../pickableKinds';
import { dataTypeLabel } from '../../../dataTypeLabel';
import type { PackBeingSaved } from '../datapackFlowStages';
import { hasNothingToPick, type KindReads } from '../useStorePicks';
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
    onOpen: (kind: PickableKind) => void;
}

/** Why a card is greyed out, or how many are picked, or nothing. */
function noteOf(page: StoreItemPage | null | undefined, picked: number): string | undefined {
    if (page && hasNothingToPick(page)) {
        return page.inPackCount > 0 ? `${page.inPackCount.toLocaleString('en-US')} in the pack already` : 'None in this store';
    }
    return picked > 0 ? `${picked.toLocaleString('en-US')} picked` : undefined;
}

export function StoreKindsStage({ pack, picks, reads, onOpen }: StoreKindsStageProps): React.ReactElement {
    return (
        <>
            {pack ? (
                <p className="datapack-export-intro">
                    Saves this store&apos;s copy of {pack.displayName} as a new version of this demo&apos;s own pack. Also pick anything you added in the Admin that it does not hold yet.
                </p>
            ) : null}
            <span className="datapack-import-label">What goes in it</span>
            <div className="datapack-flow-cards">
                {PICKABLE_KINDS.map((kind) => {
                    const picked = picks[kind]?.length ?? 0;
                    return (
                        <ChoiceCard
                            key={kind}
                            variant="compact"
                            name={dataTypeLabel(kind)}
                            description={BRINGS[kind]}
                            note={noteOf(reads[kind], picked)}
                            selected={picked > 0}
                            disabled={hasNothingToPick(reads[kind])}
                            onSelect={() => onOpen(kind)}
                        />
                    );
                })}
            </div>
        </>
    );
}
