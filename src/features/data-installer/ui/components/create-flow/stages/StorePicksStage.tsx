/**
 * Choosing what a pack saved from the store holds (owner, 2026-11-02: SCs select from several kinds,
 * so going in and out of each one was the wrong shape): the kinds on the left, the shown kind's items
 * on the right (`StoreItemsStage`), in one dialog of one size. Selections stay beside their kind.
 *
 * Every row shows at once and stays clickable while the store's counts are read, and a count of none
 * greys its row out without moving anything. Only none is said: a number could not be trusted, since
 * a kind's list leaves off what the pack being saved holds, and cart rules and companies are counted
 * across the whole store (`storeItems.ts`). So a row with a count above none stays clickable until
 * its list has answered, and is greyed out from then on if nothing was left to select.
 *
 * @module features/data-installer/ui/components/create-flow/stages/StorePicksStage
 */

import React from 'react';
import { PICKABLE_KINDS, type PickableKind, type StoreItemPage } from '../../../../pickableKinds';
import { dataTypeLabel } from '../../../dataTypeLabel';
import type { PackBeingSaved } from '../datapackFlowStages';
import { type StorePicksState, hasNothingToPick, isKnownEmpty } from '../useStorePicks';
import { StoreItemsStage } from './StoreItemsStage';
import { SelectAllRow } from '@/core/ui/components/selection/SelectAllRow';
import { cn } from '@/core/ui/utils/classNames';

const NO_PICKS: string[] = [];

/** Why a row is greyed out, or how many are selected, or nothing. */
function noteOf(page: StoreItemPage | null | undefined, count: number | undefined, picked: number): string | undefined {
    if (page && hasNothingToPick(page)) return page.inPackCount > 0 ? 'All in datapack' : 'None available';
    if (isKnownEmpty(page, count)) return 'None available';
    return picked > 0 ? `${picked.toLocaleString('en-US')} selected` : undefined;
}

function KindRow({ kind, store }: { kind: PickableKind; store: StorePicksState }): React.ReactElement {
    const picked = store.picks[kind]?.length ?? 0;
    const shown = kind === store.kind;
    const note = noteOf(store.reads[kind], store.counts[kind], picked);
    return (
        <li>
            <button
                type="button"
                className={cn('datapack-picks-kind', shown && 'datapack-picks-kind--shown', picked > 0 && 'datapack-picks-kind--picked')}
                aria-current={shown ? 'true' : undefined}
                disabled={isKnownEmpty(store.reads[kind], store.counts[kind])}
                onClick={() => store.open(kind)}
            >
                {dataTypeLabel(kind)}
                {note ? <span className="datapack-picks-note">{note}</span> : null}
            </button>
        </li>
    );
}

export interface StorePicksStageProps {
    pack?: PackBeingSaved;
    store: StorePicksState;
}

export function StorePicksStage({ pack, store }: StorePicksStageProps): React.ReactElement {
    const { kind } = store;
    return (
        <>
            {pack ? (
                <p className="datapack-export-intro">
                    Includes what {pack.displayName} put in Commerce. Select anything you added in the Admin to include it too.
                </p>
            ) : null}
            <div className="datapack-picks">
                <ul className="datapack-picks-rail">
                    <li>
                        <SelectAllRow
                            everything
                            all={store.everything.all}
                            some={store.everything.some}
                            isDisabled={store.everything.busy}
                            onToggle={() => void store.selectEverything(!store.everything.all)}
                        />
                    </li>
                    {PICKABLE_KINDS.map((each) => <KindRow key={each} kind={each} store={store} />)}
                </ul>
                <div className="datapack-picks-pane">
                    {kind ? (
                        <StoreItemsStage
                            key={kind}
                            kind={kind}
                            pack={pack}
                            answered={store.reads[kind] ?? undefined}
                            picked={store.picks[kind] ?? NO_PICKS}
                            onChange={store.setPicked}
                            onAnswered={store.answered}
                        />
                    ) : (
                        <p className="datapack-export-note">This Commerce instance has no data to select.</p>
                    )}
                </div>
            </div>
        </>
    );
}
