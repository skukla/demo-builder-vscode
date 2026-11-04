/**
 * What the batch window's questions hold, and the answers built from them (owner, 2026-11-04):
 * Delete Selected's boxes, one per project per online resource it has, and Reset Selected's Remove
 * Datapack with each pack's Save Changes As. Pure, so the screen and its tests share one reading.
 *
 * @module features/projects-dashboard/ui/batchChoices
 */

import type {
    BatchDeleteAnswer,
    BatchDeleteRow,
    BatchResetAnswer,
    BatchResetRow,
} from '@/types/projectsBatch';

/** The three things a delete may take with a project, in the table's column order. */
export type DeleteOptionKey = 'repo' | 'site' | 'datapack';

export const DELETE_OPTION_KEYS: readonly DeleteOptionKey[] = ['repo', 'site', 'datapack'];

/** Which boxes are ticked, by project path. A box a row does not have is never ticked. */
export type DeleteTicks = Readonly<Record<string, Readonly<Record<DeleteOptionKey, boolean>>>>;

/** A column's header box: whether it is drawn, and all, some or none of its boxes ticked. */
export interface ColumnState {
    offered: boolean;
    all: boolean;
    some: boolean;
}

/** A project's own answers to a reset that removes its pack with changes the SC must decide. */
export interface ResetField {
    saveAs: string;
    drop: boolean;
}

export type ResetFields = Readonly<Record<string, ResetField>>;

/** Every box where the prepare said it starts. */
export function initialDeleteTicks(rows: readonly BatchDeleteRow[]): DeleteTicks {
    return Object.fromEntries(
        rows.map((row) => [
            row.path,
            {
                repo: row.repo?.ticked === true,
                site: row.site?.ticked === true,
                datapack: row.datapack?.ticked === true,
            },
        ]),
    );
}

/** Flip one box. */
export function toggleDeleteTick(ticks: DeleteTicks, path: string, key: DeleteOptionKey): DeleteTicks {
    const own = ticks[path];
    if (!own) return ticks;
    return { ...ticks, [path]: { ...own, [key]: !own[key] } };
}

/** A column's state, over the rows that have its option. */
export function columnState(rows: readonly BatchDeleteRow[], ticks: DeleteTicks, key: DeleteOptionKey): ColumnState {
    const having = rows.filter((row) => row[key] !== undefined);
    const ticked = having.filter((row) => ticks[row.path]?.[key] === true).length;
    return { offered: having.length > 0, all: having.length > 0 && ticked === having.length, some: ticked > 0 };
}

/** A column's header box: ticks every box it can when not all are, else unticks them all. */
export function toggleColumn(rows: readonly BatchDeleteRow[], ticks: DeleteTicks, key: DeleteOptionKey): DeleteTicks {
    const on = !columnState(rows, ticks, key).all;
    const next: Record<string, Record<DeleteOptionKey, boolean>> = { ...ticks };
    for (const row of rows) {
        const own = ticks[row.path];
        if (row[key] !== undefined && own) next[row.path] = { ...own, [key]: on };
    }
    return next;
}

/** The delete's answers, one per project in the order shown. */
export function deleteAnswers(rows: readonly BatchDeleteRow[], ticks: DeleteTicks): BatchDeleteAnswer[] {
    return rows.map((row) => ({
        path: row.path,
        deleteGitHubRepo: row.repo !== undefined && ticks[row.path]?.repo === true,
        deleteDaLiveSite: row.site !== undefined && ticks[row.path]?.site === true,
        deleteDatapack: row.datapack !== undefined && ticks[row.path]?.datapack === true,
    }));
}

/** Whether any project of a reset has a pack the reset could remove. */
export function anyDatapack(rows: readonly BatchResetRow[]): boolean {
    return rows.some((row) => row.datapack !== undefined);
}

/** Whether this row needs a name or Remove Without Saving before the reset can run. */
export function asksForChanges(row: BatchResetRow, removeDatapack: boolean): boolean {
    return removeDatapack && row.datapack?.changes === 'asks';
}

const NO_FIELD: ResetField = { saveAs: '', drop: false };

/** A row's field, empty until typed in. */
export function fieldOf(fields: ResetFields, path: string): ResetField {
    return fields[path] ?? NO_FIELD;
}

/** Whether every row that asks has a name or is removed without saving. */
export function resetIsReady(rows: readonly BatchResetRow[], removeDatapack: boolean, fields: ResetFields): boolean {
    return rows.every((row) => {
        if (!asksForChanges(row, removeDatapack)) return true;
        const field = fieldOf(fields, row.path);
        return field.drop || field.saveAs.trim().length > 0;
    });
}

/** The reset's answers, one per project in the order shown. */
export function resetAnswers(rows: readonly BatchResetRow[], removeDatapack: boolean, fields: ResetFields): BatchResetAnswer[] {
    return rows.map((row) => {
        const removes = removeDatapack && row.datapack !== undefined;
        if (!removes) return { path: row.path, removeDatapack: false };
        if (row.datapack?.changes !== 'asks') return { path: row.path, removeDatapack: true };
        const field = fieldOf(fields, row.path);
        return { path: row.path, removeDatapack: true, changes: field.drop ? 'drop' : { saveAs: field.saveAs.trim() } };
    });
}
