/**
 * useBatchChoices — what the SC has chosen in the batch window's questions (owner, 2026-11-04):
 * Delete Selected's boxes, and Reset Selected's Remove Datapack with each pack's Save Changes As
 * and Remove Without Saving. The rules live in `batchChoices.ts`; this holds the state.
 *
 * @module features/projects-dashboard/ui/hooks/useBatchChoices
 */

import { useCallback, useMemo, useState } from 'react';
import {
    initialDeleteTicks,
    toggleColumn,
    toggleDeleteTick,
    type DeleteOptionKey,
    type DeleteTicks,
    type ResetFields,
} from '../batchChoices';
import type { BatchDeleteRow, PrepareProjectsBatchResponse } from '@/types/projectsBatch';

export interface BatchChoices {
    ticks: DeleteTicks;
    toggleTick: (path: string, key: DeleteOptionKey) => void;
    toggleColumn: (rows: readonly BatchDeleteRow[], key: DeleteOptionKey) => void;
    /** Reset's one Remove Datapack, ticked to start. */
    removeDatapack: boolean;
    setRemoveDatapack: (on: boolean) => void;
    fields: ResetFields;
    setSaveAs: (path: string, name: string) => void;
    setDrop: (path: string, drop: boolean) => void;
    /** Start over on the rows a prepare read. */
    begin: (response: PrepareProjectsBatchResponse) => void;
}

const NO_TICKS: DeleteTicks = {};
const NO_FIELDS: ResetFields = {};

/** The questions' state. */
export function useBatchChoices(): BatchChoices {
    const [ticks, setTicks] = useState<DeleteTicks>(NO_TICKS);
    const [removeDatapack, setRemoveDatapack] = useState(true);
    const [fields, setFields] = useState<ResetFields>(NO_FIELDS);

    const begin = useCallback((response: PrepareProjectsBatchResponse) => {
        setTicks(response.action === 'delete' ? initialDeleteTicks(response.rows) : NO_TICKS);
        setRemoveDatapack(true);
        setFields(NO_FIELDS);
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
            removeDatapack,
            setRemoveDatapack,
            fields,
            setSaveAs,
            setDrop,
            begin,
        }),
        [ticks, toggleTick, toggleWholeColumn, removeDatapack, fields, setSaveAs, setDrop, begin],
    );
}
