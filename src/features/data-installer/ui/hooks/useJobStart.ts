/**
 * A datapack job's one start (step 03, S4, S6 and S7): Install and Switch start an import, Uninstall a
 * removal (`reset-datapack`), each with its answer about the SC's changes; and Retry. Split out of
 * `useDatapackJob`.
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

/** A switch's or an uninstall's start may save the SC's changes first, and answers after it (walk F105). */
const SAVE_THEN_WRITE = { timeout: TIMEOUTS.DATAPACK_SAVE_THEN_WRITE };

/**
 * The start: Install, Switch or Uninstall with its answer about the SC's changes, and Retry. An
 * uninstall's Retry takes out what the stopped job's record still lists, and drops: whatever was to
 * be saved was saved before that job began, and the record moved onto the save.
 */
export function useJobStart(kind: JobKind, body: () => object, dispatch: Dispatch<JobEvent>) {
    const start = useDataInstallerRequest<{ activationId: string }>(
        kind === 'uninstall' ? 'reset-datapack' : 'start-datapack-import',
        SAVE_THEN_WRITE,
    );
    // The answer, kept so a run started again sends the same one; and what a Retry takes out.
    const answer = useRef<RemovalAnswer | undefined>(undefined);
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
        (given: RemovalAnswer): void => {
            answer.current = given;
            again.current = undefined;
            setSavesFirst(given.changes === 'keep');
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
