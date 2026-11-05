/**
 * useBatchChoices — what the SC has chosen in the batch window's questions (owner, 2026-11-04):
 * Delete Selected's boxes, and Reset Selected's two steps: a Remove Datapack box per project, then
 * a new datapack's name or Discard Changes per pack that asks, and which step is showing. The rules
 * live in `batchChoices.ts`; this holds the state.
 *
 * @module features/projects-dashboard/ui/hooks/useBatchChoices
 */

import { useCallback, useMemo, useState } from 'react';
import {
    initialDeleteTicks,
    initialRemoveTicks,
    toggleColumn,
    toggleDeleteTick,
    toggleDiscardColumn,
    toggleRemoveColumn,
    type DeleteOptionKey,
    type DeleteTicks,
    type RemoveTicks,
    type ResetFields,
} from '../batchChoices';
import type { BatchDeleteRow, BatchResetRow, PrepareProjectsBatchResponse } from '@/types/projectsBatch';

/** Reset Selected's two steps: the projects and whose pack goes, then the packs' changes. */
export type ResetStep = 'projects' | 'changes';

export interface BatchChoices {
    ticks: DeleteTicks;
    toggleTick: (path: string, key: DeleteOptionKey) => void;
    toggleColumn: (rows: readonly BatchDeleteRow[], key: DeleteOptionKey) => void;
    /** Reset's Remove Datapack box per project, every removable one ticked to start. */
    removeTicks: RemoveTicks;
    toggleRemove: (path: string) => void;
    toggleRemoveColumn: (rows: readonly BatchResetRow[]) => void;
    fields: ResetFields;
    setSaveAs: (path: string, name: string) => void;
    setDrop: (path: string, drop: boolean) => void;
    toggleDiscardColumn: (rows: readonly BatchResetRow[]) => void;
    step: ResetStep;
    setStep: (step: ResetStep) => void;
    /** Start over on the rows a prepare read. */
    begin: (response: PrepareProjectsBatchResponse) => void;
}

const NO_TICKS: DeleteTicks = {};
const NO_REMOVE: RemoveTicks = {};
const NO_FIELDS: ResetFields = {};

/** The questions' state. */
export function useBatchChoices(): BatchChoices {
    const [ticks, setTicks] = useState<DeleteTicks>(NO_TICKS);
    const [removeTicks, setRemoveTicks] = useState<RemoveTicks>(NO_REMOVE);
    const [fields, setFields] = useState<ResetFields>(NO_FIELDS);
    const [step, setStep] = useState<ResetStep>('projects');

    const begin = useCallback((response: PrepareProjectsBatchResponse) => {
        setTicks(response.action === 'delete' ? initialDeleteTicks(response.rows) : NO_TICKS);
        setRemoveTicks(response.action === 'reset' ? initialRemoveTicks(response.rows) : NO_REMOVE);
        setFields(NO_FIELDS);
        setStep('projects');
    }, []);

    const toggleRemove = useCallback((path: string) => {
        setRemoveTicks((previous) => ({ ...previous, [path]: previous[path] !== true }));
    }, []);

    const toggleWholeRemoveColumn = useCallback((rows: readonly BatchResetRow[]) => {
        setRemoveTicks((previous) => toggleRemoveColumn(rows, previous));
    }, []);

    const toggleWholeDiscardColumn = useCallback((rows: readonly BatchResetRow[]) => {
        setFields((previous) => toggleDiscardColumn(rows, previous));
    }, []);

    const toggleTick = useCallback((path: string, key: DeleteOptionKey) => {
        setTicks((previous) => toggleDeleteTick(previous, path, key));
    }, []);

    const toggleWholeColumn = useCallback((rows: readonly BatchDeleteRow[], key: DeleteOptionKey) => {
        setTicks((previous) => toggleColumn(rows, previous, key));
    }, []);

    const setSaveAs = useCallback((path: string, name: string) => {
        setFields((previous) => ({ ...previous, [path]: { drop: previous[path]?.drop ?? false, saveAs: name } }));
    }, []);

    const setDrop = useCallback((path: string, drop: boolean) => {
        setFields((previous) => ({ ...previous, [path]: { saveAs: previous[path]?.saveAs ?? '', drop } }));
    }, []);

    return useMemo(
        () => ({
            ticks,
            toggleTick,
            toggleColumn: toggleWholeColumn,
            removeTicks,
            toggleRemove,
            toggleRemoveColumn: toggleWholeRemoveColumn,
            fields,
            setSaveAs,
            setDrop,
            toggleDiscardColumn: toggleWholeDiscardColumn,
            step,
            setStep,
            begin,
        }),
        [ticks, toggleTick, toggleWholeColumn, removeTicks, toggleRemove, toggleWholeRemoveColumn, fields, setSaveAs, setDrop, toggleWholeDiscardColumn, step, begin],
    );
}
