/**
 * Restore on the datapack the demo uses (Phase 3/5, owner 2026-11-12, J4-2 to J4-4): the flyout's
 * main button. Pressing it sends the check (`restore-datapack` without `confirm`), which writes
 * nothing and answers one of three ways:
 * - up to date: the small result "<name> Is Up to Date", which closes itself (`ResultDialog`);
 * - unsaved edits (`CHANGES_NEED_ANSWER`): the flyout asks "Restore <name>?" (`PackActions`), and
 *   Restore sends it again confirmed;
 * - started (a newer save, or once confirmed): the import window opens on the version restored,
 *   where it picks the running job up (`DatapackJobWindow`), as Undo Last Save's does.
 *
 * @module features/data-installer/ui/hooks/useRestoreDatapack
 */

import React, { useCallback, useLayoutEffect, useState } from 'react';
import { useDataInstallerRequest } from './useDataInstallerRequest';
import type { ConfirmActionDialogProps } from '@/core/ui/components/ui/ConfirmActionDialog';
import { ResultDialog } from '@/core/ui/components/ui/ResultDialog';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { DatapackId } from '@/types/datapack';
import { ErrorCode } from '@/types/errorCodes';
import type { RestoreDatapackRequest, RestoreDatapackResult } from '@/types/webviewRequests';

const RESTORE_START = { timeout: TIMEOUTS.DATAPACK_RESTORE_START };

/** Where the SC is: nothing open, the check sent, or the confirmed restore sent. */
type Phase = 'idle' | 'checking' | 'confirming';

/** The restore: check, answer its question, and what it shows. */
export interface RestoreDatapack {
    /** Send the check. */
    check: () => void;
    /** The check found unsaved edits: the flyout asks before anything is lost. */
    asking: boolean;
    /** Restore, confirmed. */
    confirm: () => void;
    /** Cancel the question, or close the result. */
    dismiss: () => void;
    working: boolean;
    /** The up-to-date result, mounted beside the flyout's dialogs. */
    result: React.JSX.Element;
    /** Why it could not be restored; nothing otherwise. */
    note: React.JSX.Element | null;
}

/**
 * What the flyout asks over unsaved edits (J4-3): Cancel and Restore only, no "Save Your Changes
 * First?" (a save leaves nothing to restore); blue, as red is for deleting (rule 20).
 */
export function restoreQuestion(displayName: string): Pick<ConfirmActionDialogProps, 'title' | 'actionLabel' | 'actionVariant' | 'children'> {
    return {
        title: `Restore ${displayName}?`,
        actionLabel: 'Restore',
        actionVariant: 'accent',
        children: `Commerce goes back to ${displayName} as you last saved it. Anything you changed since is lost.`,
    };
}

/**
 * Restore the demo's datapack.
 *
 * @param name - the datapack's name
 * @param displayName - its name on screen
 * @param onStarted - opens the run on the version restored. Must be stable: an effect depends on it
 * @returns the restore
 */
export function useRestoreDatapack(
    name: string,
    displayName: string,
    onStarted?: (id: DatapackId) => void,
): RestoreDatapack {
    const request = useDataInstallerRequest<RestoreDatapackResult>(
        'restore-datapack',
        RESTORE_START,
    );
    const [phase, setPhase] = useState<Phase>('idle');
    const run = request.load;
    const send = useCallback(
        (next: Phase): void => {
            setPhase(next);
            const payload: RestoreDatapackRequest =
                next === 'confirming'
                    ? { datapackName: name, confirm: true }
                    : { datapackName: name };
            run(payload);
        },
        [run, name],
    );
    const check = useCallback((): void => send('checking'), [send]);
    const confirm = useCallback((): void => send('confirming'), [send]);
    const dismiss = useCallback((): void => setPhase('idle'), []);

    // Before the paint: the flyout goes from this wait to the run's window with nothing between them.
    const answer = request.value;
    useLayoutEffect(() => {
        if (!answer || !('activationId' in answer)) return;
        setPhase('idle');
        onStarted?.(answer.target);
    }, [answer, onStarted]);

    const settledIn = (each: Phase): boolean => phase === each && !request.loading;
    const asks = request.failure?.code === ErrorCode.CHANGES_NEED_ANSWER;
    const upToDate = settledIn('checking') && answer !== null && 'upToDate' in answer;
    const refused = phase !== 'idle' && !request.loading && request.failure !== null && !asks;
    const note = refused ? (
        <p className="dialog-problem text-negative">
            {displayName} couldn&rsquo;t be restored: {request.failure?.message}
        </p>
    ) : null;
    const result = (
        <ResultDialog
            isOpen={upToDate}
            title={`${displayName} Is Up to Date`}
            status="success"
            onClose={dismiss}
        />
    );
    return {
        check,
        asking: settledIn('checking') && asks,
        confirm,
        dismiss,
        working: request.loading,
        result,
        note,
    };
}
