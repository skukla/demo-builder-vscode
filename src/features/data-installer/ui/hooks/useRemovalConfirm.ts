/**
 * The removal confirm's state (datapack-engine step 05): the read of what the SC changed, the two
 * boxes, and the save's stages while the removal waits on it. Pure decisions are in
 * `removalConfirm.ts`; this holds what they decide from, so the import modal does not.
 *
 * @module features/data-installer/ui/hooks/useRemovalConfirm
 */

import { useCallback, useEffect, useState } from 'react';
import type { DatapackRemovalChanges } from '../../removalChanges';
import { type ConfirmContent, FRESH_CHOICE, type RemovalAnswer, type RemovalChoice, confirmContent, removalAnswer, toggleAlways, toggleSave } from '../components/removalConfirm';
import { useDataInstallerRequest } from './useDataInstallerRequest';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { DATAPACK_OPERATION_ID } from '@/core/utils/operationIds';
import type { OperationProgressPayload } from '@/types/webviewPayloads';

/** What the confirm's body needs. */
export interface RemovalConfirmView {
    content: ConfirmContent;
    choice: RemovalChoice;
    onToggleSave: () => void;
    onToggleAlways: () => void;
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
    /** Take the Remove press: the answer to send, the confirm closed. */
    press: () => RemovalAnswer;
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
    const press = (): RemovalAnswer => {
        setOpen(false);
        setStage(undefined);
        return removalAnswer(content, choice);
    };

    return {
        content,
        choice,
        reading: open && read.loading,
        armed: open && !read.loading,
        stage,
        arm,
        disarm: useCallback(() => setOpen(false), []),
        press,
        reopen: useCallback(() => setOpen(true), []),
        onToggleSave: useCallback(() => setChoice(toggleSave), []),
        onToggleAlways: useCallback(() => setChoice(toggleAlways), []),
    };
}
