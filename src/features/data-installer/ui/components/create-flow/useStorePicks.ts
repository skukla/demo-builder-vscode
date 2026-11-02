/**
 * What the SC has picked from the store, and what each kind's read answered (`useCreateDatapackFlow`).
 *
 * The answers are kept by kind, so going back to the cards and opening a kind again shows its list
 * at once, and a kind the store has nothing to pick from can be greyed out on its card. A read that
 * failed is forgotten on the next open, which reads again. The read itself belongs to the screen
 * showing it (`StoreItemsStage`), so an answer arriving after the SC has left can never be taken for
 * another kind's.
 *
 * How many of each kind the store has is read once, when the cards first show, without reading any
 * of them (`count-datapack-export-items`). It only ever adds a grey: a count of none. A failed count
 * says nothing and the card stays clickable, and a kind's list, once it has answered, decides.
 *
 * @module features/data-installer/ui/components/create-flow/useStorePicks
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { type PickableKind, type StoreItemPage, type StoreKindCounts, type StorePicks, pickCount } from '../../../pickableKinds';
import { useDataInstallerRequest } from '../../hooks/useDataInstallerRequest';
import type { PackBeingSaved } from './datapackFlowStages';

/** One kind's answer: its page, or null when the read failed. Absent until a read answers. */
export type KindReads = Partial<Record<PickableKind, StoreItemPage | null>>;

export interface StorePicksState {
    /** The kind whose items are open. */
    kind: PickableKind;
    picks: StorePicks;
    count: number;
    reads: KindReads;
    /** How many of each kind the store has; empty until the counts answer. */
    counts: StoreKindCounts;
    open: (kind: PickableKind) => void;
    setPicked: (ids: string[]) => void;
    answered: (kind: PickableKind, page: StoreItemPage | null) => void;
}

/** A read answered and left nothing to pick. */
export function hasNothingToPick(page: StoreItemPage | null | undefined): boolean {
    return page?.items.length === 0;
}

/** Whether a kind has nothing to pick, as far as is known: its list's answer, else a count of none. */
export function isKnownEmpty(read: StoreItemPage | null | undefined, count: number | undefined): boolean {
    return read === undefined ? count === 0 : hasNothingToPick(read);
}

const NO_COUNTS: StoreKindCounts = {};

/**
 * @param countsWanted - the cards are on screen, so the counts are wanted
 * @param pack - the pack being saved, when there is one
 */
export function useStorePicks(countsWanted: boolean, pack?: PackBeingSaved): StorePicksState {
    const [kind, setKind] = useState<PickableKind>('products');
    const [picks, setPicks] = useState<StorePicks>({});
    const [reads, setReads] = useState<KindReads>({});

    const { load: loadCounts, value: counts } = useDataInstallerRequest<StoreKindCounts>('count-datapack-export-items');
    const countsAsked = useRef(false);
    useEffect(() => {
        if (!countsWanted || countsAsked.current) return;
        countsAsked.current = true;
        loadCounts(pack ? { datapackName: pack.id.name, version: pack.id.version, source: pack.source } : {});
    }, [countsWanted, loadCounts, pack]);

    const open = useCallback((next: PickableKind): void => {
        setKind(next);
        setReads(({ [next]: page, ...rest }) => (page ? { ...rest, [next]: page } : rest));
    }, []);
    const setPicked = useCallback(
        (ids: string[]): void => setPicks((current) => ({ ...current, [kind]: ids })),
        [kind],
    );
    const answered = useCallback((of: PickableKind, page: StoreItemPage | null): void => {
        setReads((current) => ({ ...current, [of]: page }));
    }, []);

    return { kind, picks, count: pickCount(picks), reads, counts: counts ?? NO_COUNTS, open, setPicked, answered };
}
