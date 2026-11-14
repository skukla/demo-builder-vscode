/**
 * A datapack job's one start (step 03, S4, S6, S7 and S8): Install and Switch start an import,
 * Uninstall a removal (`reset-datapack`), each with its answer about the SC's changes; Restore its
 * restore (`restore-datapack`), whose check is the same request without `confirm`, started with the
 * point chosen (J9-7); Update its update (`update-datapack`) of the types ticked (step-07 U1); and
 * Retry. Split out of `useDatapackJob`.
 *
 * @module features/data-installer/ui/hooks/useJobStart
 */

import { type Dispatch, useCallback, useRef, useState } from 'react';
import type { ImportJobRecord } from '../../types';
import type { JobEvent, JobKind } from '../components/job/datapackJob';
import { useDataInstallerRequest } from './useDataInstallerRequest';
import { useImportRetry } from './useImportRetry';
import type { RemovalAnswer } from './useSwitchChanges';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { RestoreDatapackResult, RestorePoint, UpdateDatapackResult } from '@/types/webviewRequests';

/** What a start answers: the job accepted; or, Restore's check only, up to date or its question. */
export type StartAnswer = { activationId: string } | RestoreDatapackResult | UpdateDatapackResult;

/**
 * What a press adds to the start's body: a switch's or an uninstall's answer about the SC's changes;
 * Restore's point and, for Original over unsaved edits, that answer (J9-7); Update's types ticked.
 */
export type StartExtra = Partial<RemovalAnswer> & { to?: RestorePoint; dataTypes?: string[]; version?: string };

/** A switch's or an uninstall's start may save the SC's changes first, and answers after it (walk F105). */
const SAVE_THEN_WRITE = { timeout: TIMEOUTS.DATAPACK_SAVE_THEN_WRITE };
/** Restore's check compares the store with the pack before it starts anything. */
const RESTORE_START = { timeout: TIMEOUTS.DATAPACK_RESTORE_START };

/** Each kind's start request. */
function startRequest(kind: JobKind): { type: string; options: { timeout: number } } {
    if (kind === 'restore') return { type: 'restore-datapack', options: RESTORE_START };
    // An update's start checks Commerce against the newer version again before it starts.
    if (kind === 'update') return { type: 'update-datapack', options: RESTORE_START };
    const type = kind === 'uninstall' ? 'reset-datapack' : 'start-datapack-import';
    return { type, options: SAVE_THEN_WRITE };
}

/** The job a start's answer accepted, if it accepted one. */
export function acceptedActivation(answer: StartAnswer | null): string | undefined {
    return answer && 'activationId' in answer ? answer.activationId : undefined;
}

/**
 * The start: Install, Switch or Uninstall with its answer about the SC's changes, and Retry. An
 * uninstall's Retry takes out what the stopped job's record still lists, and drops: whatever was to
 * be saved was saved before that job began, and the record moved onto the save.
 */
export function useJobStart(kind: JobKind, body: () => object, dispatch: Dispatch<JobEvent>) {
    const request = startRequest(kind);
    const start = useDataInstallerRequest<StartAnswer>(request.type, request.options);
    // The answer, kept so a run started again sends the same one; and what a Retry takes out.
    const answer = useRef<StartExtra | undefined>(undefined);
    const again = useRef<object | undefined>(undefined);
    const [savesFirst, setSavesFirst] = useState(false);
    const loadStart = start.load;
    const runStart = useCallback((): void => {
        dispatch({ type: 'start' });
        loadStart({ ...body(), ...again.current, ...answer.current });
    }, [loadStart, body, dispatch]);
    const runs = useImportRetry(runStart);
    const { startImport, retry } = runs;
    const startWith = useCallback(
        (given: StartExtra | undefined): void => {
            answer.current = given;
            again.current = undefined;
            setSavesFirst(given?.changes === 'keep');
            startImport();
        },
        [startImport],
    );
    const retryFrom = useCallback(
        (record: ImportJobRecord | null): void => {
            if (kind === 'uninstall' && record) {
                again.current = { datapackName: record.datapackName, version: record.version };
                answer.current = { changes: 'drop' };
                setSavesFirst(false);
            }
            retry();
        },
        [kind, retry],
    );
    return { start, runs, startWith, retryFrom, savesFirst };
}
