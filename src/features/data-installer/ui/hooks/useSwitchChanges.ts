/**
 * What a switch knows about the datapack it switches from (step 03, S6; decisions J2-3, J8-1), and an
 * uninstall about the datapack it uninstalls (S7, J5-1): the SC's changes to it, read in the job's
 * check (`get-datapack-removal-changes`, counts only), and what Switch or Uninstall does with them.
 * With nothing changed, it starts at once with no answer, so the host reads the changes afresh. An
 * edit made after the read is never dropped unasked: a switch (and Clear) saves one in the SC's own
 * pack into it; otherwise the host refuses with `CHANGES_NEED_ANSWER` (a pack not the SC's, or any
 * pack for Uninstall, which asks with no answer, `unanswered: 'refuse'`), and that reopens the
 * question over the changes read again (`reread`). With the setting
 * `demoBuilder.dataInstaller.changesOnRemoval` on save and the datapack the SC's own, it saves into
 * it without asking; otherwise, or when the read failed, "Save Your Changes First?" asks.
 *
 * The question always has a name box (P5-Q7, owner walk 2026-11-13, step-07 D4), by the batch's
 * rules (`namesOf`, `nameProblems`, `changesOf` in `saveAsName.ts`) over one row. The SC's own
 * datapack starts with its own name: untouched, the save goes into it (`{ changes: 'keep' }`, never
 * its own name as `saveAs`); another name saves a new datapack. Someone else's starts "My Luma", or
 * "My Luma 2" when that is taken (the owner's Q1 choice, following J7-2). A name that is empty or
 * another of the SC's is refused.
 *
 * @module features/data-installer/ui/hooks/useSwitchChanges
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangesAnswer, DatapackRemovalChanges } from '../../removalChanges';
import { type PackRow, changesOf, nameProblems, namesOf } from '../../saveAsName';
import { countedRows, type TypeRow } from '../components/job/installRows';
import { useDataInstallerRequest } from './useDataInstallerRequest';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { DATAPACK_OPERATION_ID } from '@/core/utils/operationIds';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { ProjectDatapack } from '@/types/datapack';
import type { OperationProgressPayload } from '@/types/webviewPayloads';

/** What a start that uninstalls the held datapack adds to its request about the SC's changes. */
export interface RemovalAnswer {
    changes: ChangesAnswer;
    /** The name of the new datapack the changes go into, when the held one is not the SC's. */
    saveAs?: { displayName: string };
}

/** The held datapack, as `get-datapack-import-target` reports it. */
export interface SwitchedFrom {
    datapack?: ProjectDatapack;
    /** Its name as the SC knows it. */
    heldName?: string;
}

/** The save question's name field: where the changes go. */
export interface SaveAsField {
    name: string;
    /** Why the name cannot be used: the save button waits. */
    problem?: string;
    onName: (name: string) => void;
}

export interface SwitchChanges {
    /** The read has answered, or there was nothing to read. */
    settled: boolean;
    /** The changes, counted by type. */
    rows: TypeRow[];
    readFailed: boolean;
    /** Where a save goes: the SC's own datapack under its own name, else a new one by this name. */
    saveAs: SaveAsField;
    /** The datapack a save goes into, by its real name: the SC's own as the library names it, else the new name. */
    savesInto: string;
    /** What Switch or Uninstall does: ask the save question, or start with this answer (none when nothing changed). */
    onSwitch: () => RemovalAnswer | 'ask' | undefined;
    /** Read the changes again: the host refused with `CHANGES_NEED_ANSWER`, so the question asks over what is there now. */
    reread: () => void;
    /** The save question answered: save first or not. */
    answer: (saves: boolean) => RemovalAnswer;
}

const READ = { timeout: TIMEOUTS.DATAPACK_IMPORT_COMPARE };
const NO_ROWS: TypeRow[] = [];
/** The one row's key in the batch's rules, which key rows by project path. */
const HELD = 'held';

/** The held datapack as the save question's one row: the SC's own (`saves`) or someone else's (`asks`). */
function heldRow(changes: DatapackRemovalChanges | null, heldName: string): PackRow {
    const own = changes?.packName;
    return { path: HELD, name: heldName, datapack: own !== undefined ? { name: own, changes: 'saves' } : { name: heldName, changes: 'asks' } };
}

/** The save answered "save": into the SC's own pack under its own name, else a new one by the name. */
function keepOf(row: PackRow, names: Record<string, string>): RemovalAnswer {
    const answer = changesOf([row], names, 'save')[HELD];
    return answer && answer !== 'drop' ? { changes: 'keep', saveAs: { displayName: answer.saveAs } } : { changes: 'keep' };
}

/** Where a save goes, by its real name: the new one's, else the SC's own pack's as the row names it. */
function savesIntoOf(row: PackRow, names: Record<string, string>): string {
    return keepOf(row, names).saveAs?.displayName ?? row.datapack?.name ?? '';
}

/** Whether Switch or Uninstall must ask: changes the setting does not already save, or nothing known. */
function mustAsk(changes: DatapackRemovalChanges | null, readFailed: boolean): boolean {
    if (readFailed) return true;
    if (!changes || changes.count === 0) return false;
    return !(changes.alwaysSave && changes.packName !== undefined);
}

/** The read of the held datapack's changes, sent once the target names it. */
function useChangesRead(active: boolean, from: SwitchedFrom | null) {
    const read = useDataInstallerRequest<DatapackRemovalChanges>(
        'get-datapack-removal-changes',
        READ,
    );
    const held = from?.datapack;
    const { load } = read;
    const reread = useCallback((): void => {
        if (!active || !held) return;
        load({
            datapackName: held.name,
            version: held.version,
            ...(held.store === 'library' ? { source: 'library' } : {}),
        });
    }, [active, held, load]);
    useEffect(() => reread(), [reread]);
    return { read, held, reread };
}

/**
 * @param active - the job is a switch
 * @param from - the target's answer, once read
 * @param ownNames - the SC's own datapacks' names, which a new one may not take
 */
export function useSwitchChanges(
    active: boolean,
    from: SwitchedFrom | null,
    ownNames: readonly string[],
): SwitchChanges {
    const { read, held, reread } = useChangesRead(active, from);
    const [typed, setTyped] = useState<string | undefined>(undefined);
    const changes = read.value;
    const readFailed = read.failure !== null;
    const kinds = changes?.kinds;
    const rows = useMemo(() => (kinds ? countedRows(kinds) : NO_ROWS), [kinds]);
    const row = heldRow(changes, from?.heldName ?? held?.name ?? '');
    const names = namesOf([row], ownNames, typed === undefined ? {} : { [HELD]: typed });
    const name = names[HELD] ?? '';
    const problem = nameProblems([row], names, ownNames)[HELD];
    return {
        settled: !active || (from !== null && (!held || read.settled)),
        rows,
        readFailed,
        saveAs: { name, ...(problem ? { problem } : {}), onName: setTyped },
        savesInto: savesIntoOf(row, names),
        onSwitch: () => {
            if (mustAsk(changes, readFailed)) return 'ask';
            return changes && changes.count > 0 ? { changes: 'keep' } : undefined;
        },
        reread,
        answer: (saves) => (saves ? keepOf(row, names) : { changes: 'drop' }),
    };
}

/**
 * The save's stage while a switch's start waits on it: "Starting" from the press, so the run draws
 * Save Your Changes from its first frame (walk F129), then each stage the extension pushes.
 *
 * @param saving - the start is out and saves first
 */
export function useSavingStage(saving: boolean): string | undefined {
    const [stage, setStage] = useState<string | undefined>(undefined);
    useEffect(() => {
        if (!saving) {
            setStage(undefined);
            return undefined;
        }
        return webviewClient.onMessage('operationProgress', (data) => {
            const push = data as OperationProgressPayload | undefined;
            if (push?.id === DATAPACK_OPERATION_ID && push.state === 'running' && push.stage)
                setStage(push.stage);
        });
    }, [saving]);
    if (!saving) return undefined;
    return stage ?? 'Starting';
}
