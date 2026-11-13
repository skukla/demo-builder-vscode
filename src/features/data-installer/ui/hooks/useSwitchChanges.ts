/**
 * What a switch knows about the datapack it switches from (step 03, S6; decisions J2-3, J8-1): the
 * SC's changes to it, read in the job's check (`get-datapack-removal-changes`, counts only), and
 * what Switch does with them. With nothing changed, Switch starts at once; with the setting
 * `demoBuilder.dataInstaller.changesOnRemoval` on save and the datapack the SC's own, it saves into
 * it without asking; otherwise, or when the read failed, "Save Your Changes First?" asks.
 *
 * When the held datapack is not the SC's, a save makes a new one, named in the question: it starts
 * "My Luma", or "My Luma 2" when that is taken (the owner's Q1 choice, following J7-2).
 *
 * @module features/data-installer/ui/hooks/useSwitchChanges
 */

import { useEffect, useMemo, useState } from 'react';
import type { DatapackRemovalChanges } from '../../removalChanges';
import { changedRows, type TypeRow } from '../components/job/installRows';
import { freeName, nameProblem } from '../components/job/saveAsName';
import type { RemovalAnswer } from '../components/removalConfirm';
import { useDataInstallerRequest } from './useDataInstallerRequest';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { DATAPACK_OPERATION_ID } from '@/core/utils/operationIds';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { ProjectDatapack } from '@/types/datapack';
import type { OperationProgressPayload } from '@/types/webviewPayloads';

/** The held datapack, as `get-datapack-import-target` reports it. */
export interface SwitchedFrom {
    datapack?: ProjectDatapack;
    /** Its name as the SC knows it. */
    heldName?: string;
}

/** The save question's name field, when the held datapack is not the SC's. */
export interface SaveAsField {
    name: string;
    /** Why the name cannot be used: Save and Switch waits. */
    problem?: string;
    onName: (name: string) => void;
}

export interface SwitchChanges {
    /** The read has answered, or there was nothing to read. */
    settled: boolean;
    /** The changes, counted by type. */
    rows: TypeRow[];
    readFailed: boolean;
    /** Present when saving makes a new datapack, which needs a name. */
    saveAs?: SaveAsField;
    /** What Switch does: ask the save question, or start with this answer. */
    onSwitch: () => RemovalAnswer | 'ask';
    /** The save question answered: save first or not. */
    answer: (saves: boolean) => RemovalAnswer;
}

const READ = { timeout: TIMEOUTS.DATAPACK_IMPORT_COMPARE };
const NO_ROWS: TypeRow[] = [];

/** Whether Switch must ask: changes the setting does not already save, or nothing known. */
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
    useEffect(() => {
        if (!active || !held) return;
        load({
            datapackName: held.name,
            version: held.version,
            ...(held.store === 'library' ? { source: 'library' } : {}),
        });
    }, [active, held, load]);
    return { read, held };
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
    const { read, held } = useChangesRead(active, from);
    const [typed, setTyped] = useState<string | undefined>(undefined);
    const changes = read.value;
    const readFailed = read.failure !== null;
    const kinds = changes?.kinds;
    const rows = useMemo(() => (kinds ? changedRows(kinds) : NO_ROWS), [kinds]);
    const own = changes?.packName !== undefined;
    const name = typed ?? freeName(from?.heldName ?? held?.name ?? '', ownNames);
    const problem = own ? undefined : nameProblem(name, ownNames);
    const keep = (): RemovalAnswer =>
        own ? { changes: 'keep' } : { changes: 'keep', saveAs: { displayName: name.trim() } };
    return {
        settled: !active || (from !== null && (!held || read.settled)),
        rows,
        readFailed,
        ...(own ? {} : { saveAs: { name, ...(problem ? { problem } : {}), onName: setTyped } }),
        onSwitch: () => {
            if (mustAsk(changes, readFailed)) return 'ask';
            return changes && changes.count > 0 ? { changes: 'keep' } : { changes: 'drop' };
        },
        answer: (saves) => (saves ? keep() : { changes: 'drop' }),
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
