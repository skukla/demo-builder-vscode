/**
 * What the SC has selected from the store, and what each kind's read answered (`useCreateDatapackFlow`).
 *
 * The answers are kept by kind, so returning to a kind shows its list at once, and a kind the store
 * has nothing to select from can be greyed out on its row. A read that failed is forgotten on the
 * next open, which reads again. The read itself belongs to the pane showing it (`StoreItemsStage`),
 * so an answer arriving after the SC has moved on can never be taken for another kind's.
 *
 * How many of each kind the store has is read once, when the screen first shows, without reading any
 * of them (`count-datapack-export-items`). It only ever adds a grey: a count of none. A failed count
 * says nothing and the row stays clickable, and a kind's list, once it has answered, decides.
 *
 * The screen is not shown until the counts have settled, so every row draws in its final state
 * (owner, 2026-11-02: rows drew bright, then greyed out one at a time). The first kind's list then
 * loads in its own pane, as every other kind's does (owner, 2026-11-05: waiting the whole dialog for
 * it as well made the wait too long).
 *
 * The kind shown is the one the SC chose, until that turns out to have nothing to select: then the
 * next that may have some, so the pane is never empty while anything else could fill it.
 *
 * **Everything starts ticked** (overview 7b), as a kind-level "all": a kind wholly ticked needs no
 * read to be ticked, so the screen opens on its counts alone. Its ids are known once its list is
 * read, when the SC opens it or when `readWhole` reads the rest for Next. Ticking or unticking an
 * item turns its kind into a list of ids. The save takes ids only (`selectionsOf`), so a whole kind
 * whose read fails or has nothing hands on nothing.
 *
 * **Select All Data** (owner, 2026-11-03) ticks every kind whole, reading nothing; unticking it
 * clears every kind. Its box is ticked when every kind that may have something is wholly ticked,
 * and dashed when some are.
 *
 * @module features/data-installer/ui/components/create-flow/useStorePicks
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PICKABLE_KINDS, type PickableKind, type StoreItemPage, type StoreKindCounts, type StorePicks, pickCount } from '../../../pickableKinds';
import { useDataInstallerRequest } from '../../hooks/useDataInstallerRequest';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { HandlerResponse } from '@/types/handlers';

/** One kind's answer: its page, or null when the read failed. Absent until a read answers. */
export type KindReads = Partial<Record<PickableKind, StoreItemPage | null>>;

export interface StorePicksState {
    /** The kinds on the left, in order. */
    kinds: readonly PickableKind[];
    /** The kind whose items are shown; none when the store has nothing of any kind to select. */
    kind: PickableKind | undefined;
    /** The ids ticked, by kind: a whole kind's once its list is read. */
    picks: StorePicks;
    /** The kinds ticked whole, read or not. */
    whole: ReadonlySet<PickableKind>;
    reads: KindReads;
    /** How many of each kind the store has; empty until the counts answer. */
    counts: StoreKindCounts;
    /** The counts are in, so every row can draw in its final state. Once true, stays true. */
    ready: boolean;
    open: (kind: PickableKind) => void;
    setPicked: (ids: string[]) => void;
    answered: (kind: PickableKind, page: StoreItemPage | null) => void;
    /** Select All Data's box: every kind wholly ticked, and something ticked. */
    everything: { all: boolean; some: boolean };
    /** Tick every kind whole, or clear them all. Reads nothing. */
    selectEverything: (on: boolean) => void;
    /** Read every whole kind not yet read (one at a time), so `picks` holds its ids; answers them. */
    readWhole: () => Promise<StorePicks>;
}

/** A read answered and left nothing to pick. */
function hasNothingToPick(page: StoreItemPage | null | undefined): boolean {
    return page?.items.length === 0;
}

/** Whether a kind has nothing to pick, as far as is known: its list's answer, else a count of none. */
export function isKnownEmpty(read: StoreItemPage | null | undefined, count: number | undefined): boolean {
    return read === undefined ? count === 0 : hasNothingToPick(read);
}

const NO_COUNTS: StoreKindCounts = {};

/** One kind's list, as its pane reads it (`list-datapack-export-items`); null when it did not answer. */
async function readKind(kind: PickableKind): Promise<StoreItemPage | null> {
    try {
        const answer = await webviewClient.request<HandlerResponse>('list-datapack-export-items', { dataType: kind });
        return answer?.success === true ? (answer.data as StoreItemPage) : null;
    } catch {
        return null;
    }
}

/** The kinds that may have something to select, as far as is known. */
function openKinds(reads: KindReads, counts: StoreKindCounts, kinds: readonly PickableKind[]): PickableKind[] {
    return kinds.filter((kind) => !isKnownEmpty(reads[kind], counts[kind]));
}

/** The ids ticked, kinds with none left out: each kind's own, and a whole kind's every item once read. */
function picksOf(listed: StorePicks, whole: ReadonlySet<PickableKind>, reads: KindReads): StorePicks {
    const out: StorePicks = {};
    for (const kind of PICKABLE_KINDS) {
        const ids = whole.has(kind) ? reads[kind]?.items.map((item) => item.id) : listed[kind];
        if (ids && ids.length > 0) out[kind] = ids;
    }
    return out;
}

/** Every kind that may have something is wholly ticked; something is ticked. */
function everythingOf(picks: StorePicks, whole: ReadonlySet<PickableKind>, reads: KindReads, open: readonly PickableKind[]): { all: boolean; some: boolean } {
    const wholly = (kind: PickableKind): boolean => {
        const page = reads[kind];
        return whole.has(kind) || (!!page && (picks[kind]?.length ?? 0) === page.items.length);
    };
    return {
        all: open.length > 0 && open.every(wholly),
        some: pickCount(picks) > 0 || open.some((kind) => whole.has(kind)),
    };
}

/** The chosen kind, or the next after it that may have something to select. */
function kindToShow(chosen: PickableKind, reads: KindReads, counts: StoreKindCounts, kinds: readonly PickableKind[]): PickableKind | undefined {
    const from = kinds.indexOf(chosen);
    const inTurn = [...kinds.slice(from), ...kinds.slice(0, from)];
    return inTurn.find((kind) => !isKnownEmpty(reads[kind], counts[kind]));
}

/**
 * @param countsWanted - the kinds are on screen, so the counts are wanted
 */
export function useStorePicks(countsWanted: boolean): StorePicksState {
    const kinds = PICKABLE_KINDS;
    const [chosen, setChosen] = useState<PickableKind>(kinds[0] ?? 'products');
    // Kinds picked item by item; every other kind in `whole` is ticked whole (overview 7b).
    const [listed, setListed] = useState<StorePicks>({});
    const [whole, setWhole] = useState<ReadonlySet<PickableKind>>(() => new Set(kinds));
    const [reads, setReads] = useState<KindReads>({});

    const { load: loadCounts, value: counts, settled: countsSettled } = useDataInstallerRequest<StoreKindCounts>('count-datapack-export-items');
    const countsAsked = useRef(false);
    useEffect(() => {
        if (!countsWanted || countsAsked.current) return;
        countsAsked.current = true;
        loadCounts({});
    }, [countsWanted, loadCounts]);

    const known = counts ?? NO_COUNTS;
    const kind = kindToShow(chosen, reads, known, kinds);
    const picks = useMemo(() => picksOf(listed, whole, reads), [listed, whole, reads]);

    const open = useCallback((next: PickableKind): void => {
        setChosen(next);
        setReads(({ [next]: page, ...rest }) => (page ? { ...rest, [next]: page } : rest));
    }, []);
    const setPicked = useCallback(
        (ids: string[]): void => {
            if (!kind) return;
            setWhole((current) => new Set([...current].filter((each) => each !== kind)));
            setListed((current) => ({ ...current, [kind]: ids }));
        },
        [kind],
    );
    const answered = useCallback((of: PickableKind, page: StoreItemPage | null): void => {
        setReads((current) => ({ ...current, [of]: page }));
    }, []);
    const selectEverything = useCallback(
        (on: boolean): void => {
            setListed({});
            setWhole(on ? new Set(kinds) : new Set());
        },
        [kinds],
    );
    const readWhole = useCallback(async (): Promise<StorePicks> => {
        const now: KindReads = { ...reads };
        for (const each of whole) {
            if (now[each] || isKnownEmpty(now[each], known[each])) continue;
            now[each] = await readKind(each);
            answered(each, now[each] ?? null);
        }
        return picksOf(listed, whole, now);
    }, [whole, reads, known, answered, listed]);

    return {
        kinds,
        kind,
        picks,
        whole,
        reads,
        counts: known,
        ready: countsSettled,
        open,
        setPicked,
        answered,
        everything: everythingOf(picks, whole, reads, openKinds(reads, known, kinds)),
        selectEverything,
        readWhole,
    };
}
