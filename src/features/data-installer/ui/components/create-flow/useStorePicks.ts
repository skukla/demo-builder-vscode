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
 * The screen is not shown until the counts have settled and the first kind with anything to select
 * has answered (owner, 2026-11-02: rows drew bright, then filled in and greyed out one at a time).
 * After that it stays shown: another kind's read waits in its own pane.
 *
 * The kind shown is the one the SC chose, until that turns out to have nothing to select: then the
 * next that may have some, so the pane is never empty while anything else could fill it.
 *
 * **Select Everything** (owner, 2026-11-03) ticks every item of every kind that may have some,
 * reading first any kind not yet opened; unticking it clears every kind. Its box is ticked when every
 * kind read is wholly selected, and dashed when some are.
 *
 * @module features/data-installer/ui/components/create-flow/useStorePicks
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { PICKABLE_KINDS, type PickableKind, type StoreItemPage, type StoreKindCounts, type StorePicks, pickCount } from '../../../pickableKinds';
import { useDataInstallerRequest } from '../../hooks/useDataInstallerRequest';
import type { PackBeingSaved } from './datapackFlowStages';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { HandlerResponse } from '@/types/handlers';

/** One kind's answer: its page, or null when the read failed. Absent until a read answers. */
export type KindReads = Partial<Record<PickableKind, StoreItemPage | null>>;

export interface StorePicksState {
    /** The kind whose items are shown; none when the store has nothing of any kind to select. */
    kind: PickableKind | undefined;
    picks: StorePicks;
    count: number;
    reads: KindReads;
    /** How many of each kind the store has; empty until the counts answer. */
    counts: StoreKindCounts;
    /** Both columns can show what they are meant to. Once true, stays true. */
    ready: boolean;
    /** The kind to read while the screen is not ready yet, if one is due. */
    firstRead: PickableKind | undefined;
    open: (kind: PickableKind) => void;
    setPicked: (ids: string[]) => void;
    answered: (kind: PickableKind, page: StoreItemPage | null) => void;
    /** Select Everything's box: every kind wholly ticked, some ticked, and still reading. */
    everything: { all: boolean; some: boolean; busy: boolean };
    /** Tick every item of every kind (reading those not opened yet), or clear them all. */
    selectEverything: (on: boolean) => Promise<void>;
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

/** One kind's list, as its pane reads it (`list-datapack-export-items`); null when it did not answer. */
async function readKind(kind: PickableKind, pack: PackBeingSaved | undefined): Promise<StoreItemPage | null> {
    const of = pack ? { datapackName: pack.id.name, version: pack.id.version, source: pack.source } : {};
    try {
        const answer = await webviewClient.request<HandlerResponse>('list-datapack-export-items', { dataType: kind, ...of });
        return answer?.success === true ? (answer.data as StoreItemPage) : null;
    } catch {
        return null;
    }
}

/** Every kind that may have something to select is read and wholly ticked. */
function everythingOf(picks: StorePicks, reads: KindReads, counts: StoreKindCounts): { all: boolean; some: boolean } {
    const open = PICKABLE_KINDS.filter((kind) => !isKnownEmpty(reads[kind], counts[kind]));
    const all = open.length > 0 && open.every((kind) => {
        const page = reads[kind];
        return page !== undefined && page !== null && (picks[kind]?.length ?? 0) === page.items.length;
    });
    return { all, some: pickCount(picks) > 0 };
}

/** The chosen kind, or the next after it that may have something to select. */
function kindToShow(chosen: PickableKind, reads: KindReads, counts: StoreKindCounts): PickableKind | undefined {
    const from = PICKABLE_KINDS.indexOf(chosen);
    const inTurn = [...PICKABLE_KINDS.slice(from), ...PICKABLE_KINDS.slice(0, from)];
    return inTurn.find((kind) => !isKnownEmpty(reads[kind], counts[kind]));
}

/**
 * @param countsWanted - the kinds are on screen, so the counts are wanted
 * @param pack - the pack being saved, when there is one
 */
export function useStorePicks(countsWanted: boolean, pack?: PackBeingSaved): StorePicksState {
    const [chosen, setChosen] = useState<PickableKind>('products');
    const [picks, setPicks] = useState<StorePicks>({});
    const [reads, setReads] = useState<KindReads>({});

    const { load: loadCounts, value: counts, settled: countsSettled } = useDataInstallerRequest<StoreKindCounts>('count-datapack-export-items');
    const countsAsked = useRef(false);
    useEffect(() => {
        if (!countsWanted || countsAsked.current) return;
        countsAsked.current = true;
        loadCounts(pack ? { datapackName: pack.id.name, version: pack.id.version, source: pack.source } : {});
    }, [countsWanted, loadCounts, pack]);

    const known = counts ?? NO_COUNTS;
    const kind = kindToShow(chosen, reads, known);
    const shown = useRef(false);
    if (countsSettled && (kind === undefined || reads[kind] !== undefined)) shown.current = true;
    const firstRead = countsSettled && !shown.current ? kind : undefined;

    const open = useCallback((next: PickableKind): void => {
        setChosen(next);
        setReads(({ [next]: page, ...rest }) => (page ? { ...rest, [next]: page } : rest));
    }, []);
    const setPicked = useCallback(
        (ids: string[]): void => setPicks((current) => (kind ? { ...current, [kind]: ids } : current)),
        [kind],
    );
    const answered = useCallback((of: PickableKind, page: StoreItemPage | null): void => {
        setReads((current) => ({ ...current, [of]: page }));
    }, []);

    const [busy, setBusy] = useState(false);
    const selectEverything = useCallback(
        async (on: boolean): Promise<void> => {
            if (!on) {
                setPicks({});
                return;
            }
            setBusy(true);
            try {
                const next: StorePicks = {};
                for (const each of PICKABLE_KINDS) {
                    if (isKnownEmpty(reads[each], known[each])) continue;
                    const page = reads[each] ?? (await readKind(each, pack));
                    if (reads[each] === undefined) answered(each, page);
                    if (page && page.items.length > 0) next[each] = page.items.map((item) => item.id);
                }
                setPicks(next);
            } finally {
                setBusy(false);
            }
        },
        [reads, known, pack, answered],
    );

    return {
        kind,
        picks,
        count: pickCount(picks),
        reads,
        counts: known,
        ready: shown.current,
        firstRead,
        open,
        setPicked,
        answered,
        everything: { ...everythingOf(picks, reads, known), busy },
        selectEverything,
    };
}
