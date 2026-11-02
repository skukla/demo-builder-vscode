/**
 * What the SC has picked from the store, and what each kind's read answered (`useCreateDatapackFlow`).
 *
 * The answers are kept by kind, so going back to the cards and opening a kind again shows its list
 * at once, and a kind the store has nothing to pick from can be greyed out on its card. A read that
 * failed is forgotten on the next open, which reads again. The read itself belongs to the screen
 * showing it (`StoreItemsStage`), so an answer arriving after the SC has left can never be taken for
 * another kind's.
 *
 * @module features/data-installer/ui/components/create-flow/useStorePicks
 */

import { useCallback, useState } from 'react';
import { type PickableKind, type StoreItemPage, type StorePicks, pickCount } from '../../../pickableKinds';

/** One kind's answer: its page, or null when the read failed. Absent until a read answers. */
export type KindReads = Partial<Record<PickableKind, StoreItemPage | null>>;

export interface StorePicksState {
    /** The kind whose items are open. */
    kind: PickableKind;
    picks: StorePicks;
    count: number;
    reads: KindReads;
    open: (kind: PickableKind) => void;
    setPicked: (ids: string[]) => void;
    answered: (kind: PickableKind, page: StoreItemPage | null) => void;
}

/** A read answered and left nothing to pick. */
export function hasNothingToPick(page: StoreItemPage | null | undefined): boolean {
    return page?.items.length === 0;
}

export function useStorePicks(): StorePicksState {
    const [kind, setKind] = useState<PickableKind>('products');
    const [picks, setPicks] = useState<StorePicks>({});
    const [reads, setReads] = useState<KindReads>({});

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

    return { kind, picks, count: pickCount(picks), reads, open, setPicked, answered };
}
