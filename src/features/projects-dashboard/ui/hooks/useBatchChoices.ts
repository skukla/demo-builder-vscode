/**
 * useBatchChoices — what the SC has chosen in the batch window's questions (owner, 2026-11-04):
 * Delete Selected's boxes and Reset Selected's Uninstall Datapack box per project, then, for either,
 * whether "Save Your Changes First?" is showing and the names typed in it (step-05 S1, J7-2). The
 * rules live in `batchChoices.ts`; this holds the state.
 *
 * @module features/projects-dashboard/ui/hooks/useBatchChoices
 */

import { useCallback, useMemo, useState } from 'react';
import {
    initialDeleteTicks,
    initialRemoveTicks,
    toggleColumn,
    toggleDeleteTick,
    toggleRemoveColumn,
    type DeleteOptionKey,
    type DeleteTicks,
    type RemoveTicks,
    type SaveNames,
} from '../batchChoices';
import type { BatchDeleteRow, BatchResetRow, PrepareProjectsBatchResponse } from '@/types/projectsBatch';

export interface BatchChoices {
    ticks: DeleteTicks;
    toggleTick: (path: string, key: DeleteOptionKey) => void;
    toggleColumn: (rows: readonly BatchDeleteRow[], key: DeleteOptionKey) => void;
    /** Reset's Uninstall Datapack box per project, every removable one ticked to start. */
    removeTicks: RemoveTicks;
    toggleRemove: (path: string) => void;
    toggleRemoveColumn: (rows: readonly BatchResetRow[]) => void;
    /** "Save Your Changes First?" is showing, over the questions it follows. */
    saving: boolean;
    askToSave: () => void;
    /** The names typed in the save question, by project path; a row not typed in keeps its start. */
    typedNames: SaveNames;
    setName: (path: string, name: string) => void;
    /** Start over on the rows a prepare read. */
    begin: (response: PrepareProjectsBatchResponse) => void;
}

const NO_TICKS: DeleteTicks = {};
const NO_REMOVE: RemoveTicks = {};
const NO_NAMES: SaveNames = {};

/** The questions' state. */
export function useBatchChoices(): BatchChoices {
    const [ticks, setTicks] = useState<DeleteTicks>(NO_TICKS);
    const [removeTicks, setRemoveTicks] = useState<RemoveTicks>(NO_REMOVE);
    const [saving, setSaving] = useState(false);
    const [typedNames, setTypedNames] = useState<SaveNames>(NO_NAMES);

    const begin = useCallback((response: PrepareProjectsBatchResponse) => {
        setTicks(response.action === 'delete' ? initialDeleteTicks(response.rows) : NO_TICKS);
        setRemoveTicks(response.action === 'reset' ? initialRemoveTicks(response.rows) : NO_REMOVE);
        setSaving(false);
        setTypedNames(NO_NAMES);
    }, []);

    const toggleRemove = useCallback((path: string) => {
        setRemoveTicks((previous) => ({ ...previous, [path]: previous[path] !== true }));
    }, []);

    const toggleWholeRemoveColumn = useCallback((rows: readonly BatchResetRow[]) => {
        setRemoveTicks((previous) => toggleRemoveColumn(rows, previous));
    }, []);

    const toggleTick = useCallback((path: string, key: DeleteOptionKey) => {
        setTicks((previous) => toggleDeleteTick(previous, path, key));
    }, []);

    const toggleWholeColumn = useCallback((rows: readonly BatchDeleteRow[], key: DeleteOptionKey) => {
        setTicks((previous) => toggleColumn(rows, previous, key));
    }, []);

    const askToSave = useCallback(() => setSaving(true), []);

    const setName = useCallback((path: string, name: string) => {
        setTypedNames((previous) => ({ ...previous, [path]: name }));
    }, []);

    return useMemo(
        () => ({
            ticks,
            toggleTick,
            toggleColumn: toggleWholeColumn,
            removeTicks,
            toggleRemove,
            toggleRemoveColumn: toggleWholeRemoveColumn,
            saving,
            askToSave,
            typedNames,
            setName,
            begin,
        }),
        [ticks, toggleTick, toggleWholeColumn, removeTicks, toggleRemove, toggleWholeRemoveColumn, saving, askToSave, typedNames, setName, begin],
    );
}
