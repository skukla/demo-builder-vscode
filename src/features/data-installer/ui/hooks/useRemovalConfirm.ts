/**
 * The removal confirm's state (datapack-engine step 05): the read of what the SC changed, the box,
 * the Save As name, and the save's stages while the removal waits on it. Pure decisions are in
 * `removalConfirm.ts`; this holds what they decide from, so the import modal does not.
 *
 * @module features/data-installer/ui/hooks/useRemovalConfirm
 */

import { useCallback, useEffect, useState } from 'react';
import type { DatapackRemovalChanges, DatapackRemovalScope } from '../../removalChanges';
import { type ConfirmContent, FRESH_CHOICE, type RemovalAnswer, type RemovalChoice, confirmContent, removalAnswer, saveAsNameOf, toggleAlways } from '../components/removalConfirm';
import { useDataInstallerRequest } from './useDataInstallerRequest';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { DATAPACK_OPERATION_ID } from '@/core/utils/operationIds';
import type { DatapackId } from '@/types/datapack';
import type { OperationProgressPayload } from '@/types/webviewPayloads';

/** What the confirm's body needs. */
export interface RemovalConfirmView {
    content: ConfirmContent;
    choice: RemovalChoice;
    onToggleAlways: () => void;
    /** The Save As name, as typed. */
    onSaveAsName: (name: string) => void;
}

export interface RemovalConfirm extends RemovalConfirmView {
    /** The read is out: the dialog's silent wait, so a confirm is never seen to change. */
    reading: boolean;
    /** The read has answered and the confirm is up. */
    armed: boolean;
    /** Which stage of saving first the removal is on, once it has started saving. */
    stage: string | undefined;
    /** The Remove press was made: read the store, then show the confirm with the boxes fresh. */
    arm: (pack: unknown) => void;
    /** Cancel: back to the form. Nothing has changed. */
    disarm: () => void;
    /** Take a press: save first (`true`) or not; the answer to send, the confirm closed. */
    press: (save: boolean) => RemovalAnswer;
    /** Saving first as a new pack needs a name. */
    canSave: boolean;
    /** Back from a save that failed: the same confirm, the boxes as they were. */
    reopen: () => void;
}

export function useRemovalConfirm(): RemovalConfirm {
    const read = useDataInstallerRequest<DatapackRemovalChanges>('get-datapack-removal-changes');
    const [open, setOpen] = useState(false);
    const [choice, setChoice] = useState<RemovalChoice>(FRESH_CHOICE);
    const [stage, setStage] = useState<string | undefined>(undefined);

    useEffect(
        () =>
            webviewClient.onMessage('operationProgress', (data) => {
                const push = data as OperationProgressPayload | undefined;
                if (push?.id === DATAPACK_OPERATION_ID && push.state === 'running' && push.stage) setStage(push.stage);
            }),
        [],
    );

    const content = confirmContent(read.value, read.failure);
    const load = read.load;
    const arm = useCallback(
        (pack: unknown): void => {
            setChoice(FRESH_CHOICE);
            setOpen(true);
            load(pack);
        },
        [load],
    );
    const press = (save: boolean): RemovalAnswer => {
        setOpen(false);
        setStage(undefined);
        return removalAnswer(content, choice, save);
    };
    const canSave = content.kind !== 'changes' || content.packName !== undefined || saveAsNameOf(content, choice) !== '';

    return {
        content,
        choice,
        reading: open && read.loading,
        armed: open && !read.loading,
        stage,
        arm,
        disarm: useCallback(() => setOpen(false), []),
        press,
        canSave,
        reopen: useCallback(() => setOpen(true), []),
        onToggleAlways: useCallback(() => setChoice(toggleAlways), []),
        onSaveAsName: useCallback((name: string) => setChoice((current) => ({ ...current, saveAsName: name })), []),
    };
}

/** What a removal of this pack takes, as the form and the confirm need it. */
export interface RemovalScope {
    /** The kinds on its install record; null with no record, or one that cannot be read. */
    recordedKinds: string[] | null;
    /** A removal takes all the record lists, so nothing has to be ticked first. */
    removesAll: boolean;
    /** The read has answered at least once. */
    settled: boolean;
}

/**
 * Whether Demo Builder's engine installed this pack, and so what a removal of it would take. Without
 * a record the service removes the types it is sent. Read each time the form shows: an import or a
 * removal since the last look moved the record.
 */
export function useRemovalScope(pack: DatapackId, showingForm: boolean): RemovalScope {
    const { load, value, settled } = useDataInstallerRequest<DatapackRemovalScope>('get-datapack-removal-scope');
    const { name, version } = pack;
    useEffect(() => {
        if (showingForm) load({ datapackName: name, version });
    }, [showingForm, load, name, version]);
    const recordedKinds = value?.recordedKinds ?? null;
    return { recordedKinds, removesAll: (recordedKinds?.length ?? 0) > 0, settled };
}
