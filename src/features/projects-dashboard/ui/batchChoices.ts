/**
 * What the batch window's questions hold, and the answers built from them (owner, 2026-11-04):
 * Delete Selected's boxes, one per project per online resource it has, and Reset Selected's two
 * steps: a Remove Datapack box per project, then a new name or Discard Changes for each removed pack
 * that is not the SC's and has changes. Pure, so the screen and its tests share one reading.
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

/** Whose datapack a reset removes, by project path: a box only where the pack can go. */
export type RemoveTicks = Readonly<Record<string, boolean>>;

/** A pack the batch may remove: there is one, and its changes were read (option B keeps the rest). */
export function removable(row: BatchResetRow): boolean {
    return row.datapack !== undefined && row.datapack.changes !== 'unchecked';
}

/** Every removable pack ticked, as the window opens. */
export function initialRemoveTicks(rows: readonly BatchResetRow[]): RemoveTicks {
    return Object.fromEntries(rows.filter(removable).map((row) => [row.path, true]));
}

function removes(row: BatchResetRow, ticks: RemoveTicks): boolean {
    return removable(row) && ticks[row.path] === true;
}

/** The Remove Datapack column's header box, over the rows that have a box. */
export function removeColumnState(rows: readonly BatchResetRow[], ticks: RemoveTicks): ColumnState {
    const having = rows.filter(removable);
    const ticked = having.filter((row) => ticks[row.path] === true).length;
    return { offered: having.length > 0, all: having.length > 0 && ticked === having.length, some: ticked > 0 };
}

/** The header ticks every box when not all are, else unticks them all. */
export function toggleRemoveColumn(rows: readonly BatchResetRow[], ticks: RemoveTicks): RemoveTicks {
    const on = !removeColumnState(rows, ticks).all;
    return { ...ticks, ...Object.fromEntries(rows.filter(removable).map((row) => [row.path, on])) };
}

/** Step 2's rows: each removed pack that is not the SC's and has changes. */
export function changeRows(rows: readonly BatchResetRow[], ticks: RemoveTicks): BatchResetRow[] {
    return rows.filter((row) => removes(row, ticks) && row.datapack?.changes === 'asks');
}

const NO_FIELD: ResetField = { saveAs: '', drop: false };

/** What step 2 holds for one project's pack: the new pack's name, or that its changes go. */
export function fieldOf(fields: ResetFields, path: string): ResetField {
    return fields[path] ?? NO_FIELD;
}

/** The step 2 rows whose new name another row above already uses, ignoring case and spaces. */
export function duplicateNamePaths(rows: readonly BatchResetRow[], ticks: RemoveTicks, fields: ResetFields): Set<string> {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const row of changeRows(rows, ticks)) {
        const field = fieldOf(fields, row.path);
        const name = field.saveAs.trim().toLowerCase();
        if (field.drop || !name) continue;
        if (seen.has(name)) dupes.add(row.path);
        seen.add(name);
    }
    return dupes;
}

/** The Discard Changes column's header box, over step 2's rows. */
export function discardColumnState(rows: readonly BatchResetRow[], fields: ResetFields): ColumnState {
    const dropped = rows.filter((row) => fieldOf(fields, row.path).drop).length;
    return { offered: rows.length > 0, all: rows.length > 0 && dropped === rows.length, some: dropped > 0 };
}

/** The header discards every row's changes when not all are, else none; typed names are kept. */
export function toggleDiscardColumn(rows: readonly BatchResetRow[], fields: ResetFields): ResetFields {
    const drop = !discardColumnState(rows, fields).all;
    return { ...fields, ...Object.fromEntries(rows.map((row) => [row.path, { ...fieldOf(fields, row.path), drop }])) };
}

/** A reset may run once every pack that asks has a unique name, or has its changes discarded. */
export function resetIsReady(rows: readonly BatchResetRow[], ticks: RemoveTicks, fields: ResetFields): boolean {
    const dupes = duplicateNamePaths(rows, ticks, fields);
    return changeRows(rows, ticks).every((row) => {
        const field = fieldOf(fields, row.path);
        return field.drop || (field.saveAs.trim().length > 0 && !dupes.has(row.path));
    });
}

/** One answer per project: keep the pack, remove it, or remove it after saving or dropping its changes. */
export function resetAnswers(rows: readonly BatchResetRow[], ticks: RemoveTicks, fields: ResetFields): BatchResetAnswer[] {
    return rows.map((row) => {
        if (!removes(row, ticks)) return { path: row.path, removeDatapack: false };
        if (row.datapack?.changes !== 'asks') return { path: row.path, removeDatapack: true };
        const field = fieldOf(fields, row.path);
        return { path: row.path, removeDatapack: true, changes: field.drop ? 'drop' : { saveAs: field.saveAs.trim() } };
    });
}
