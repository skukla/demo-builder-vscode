/**
 * What the batch window's questions hold, and the answers built from them (owner, 2026-11-04):
 * Delete Selected's boxes, one per project per thing it may take (its repository, its DA.live site,
 * its datapack's data), and Reset Selected's Uninstall Datapack box per project. Both then ask, on a
 * second step, a new name or Discard Changes for each pack whose data goes that is not the SC's and
 * has changes (walk F96 gave the delete that step). Pure, so the screen and its tests share one
 * reading.
 *
 * @module features/projects-dashboard/ui/batchChoices
 */

import type {
    BatchDatapack,
    BatchDeleteAnswer,
    BatchDeleteRow,
    BatchResetAnswer,
    BatchResetRow,
} from '@/types/projectsBatch';

/** A project of either batch, as the datapack questions read it. */
export type PackRow = Pick<BatchResetRow, 'path' | 'name' | 'datapack'>;

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
                // Uninstall Datapack writes to a store: never ticked to start (walk F96).
                datapack: false,
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

/** A pack the batch may remove the data of: there is one, and its changes were read. */
export function removable(row: { datapack?: BatchDatapack }): boolean {
    return row.datapack !== undefined && row.datapack.changes !== 'unchecked';
}

/** Whether a delete row has a box for an option: the datapack's only when its changes were read. */
export function offers(row: BatchDeleteRow, key: DeleteOptionKey): boolean {
    return key === 'datapack' ? removable(row) : row[key] !== undefined;
}

/** A column's state, over the rows that have its option. */
export function columnState(rows: readonly BatchDeleteRow[], ticks: DeleteTicks, key: DeleteOptionKey): ColumnState {
    const having = rows.filter((row) => offers(row, key));
    const ticked = having.filter((row) => ticks[row.path]?.[key] === true).length;
    return { offered: having.length > 0, all: having.length > 0 && ticked === having.length, some: ticked > 0 };
}

/** A column's header box: ticks every box it can when not all are, else unticks them all. */
export function toggleColumn(rows: readonly BatchDeleteRow[], ticks: DeleteTicks, key: DeleteOptionKey): DeleteTicks {
    const on = !columnState(rows, ticks, key).all;
    const next: Record<string, Record<DeleteOptionKey, boolean>> = { ...ticks };
    for (const row of rows) {
        const own = ticks[row.path];
        if (offers(row, key) && own) next[row.path] = { ...own, [key]: on };
    }
    return next;
}

/** Whose datapack's data goes, by project path: a box only where the pack can go. */
export type RemoveTicks = Readonly<Record<string, boolean>>;

/** A delete's Uninstall Datapack boxes, as step 2 reads them. */
export function dataTicks(rows: readonly BatchDeleteRow[], ticks: DeleteTicks): RemoveTicks {
    return Object.fromEntries(rows.map((row) => [row.path, offers(row, 'datapack') && ticks[row.path]?.datapack === true]));
}

/** Every removable pack ticked, as the window opens. */
export function initialRemoveTicks(rows: readonly BatchResetRow[]): RemoveTicks {
    return Object.fromEntries(rows.filter(removable).map((row) => [row.path, true]));
}

function removes(row: PackRow, ticks: RemoveTicks): boolean {
    return removable(row) && ticks[row.path] === true;
}

/** The Uninstall Datapack column's header box, over the rows that have a box. */
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
export function changeRows<Row extends PackRow>(rows: readonly Row[], ticks: RemoveTicks): Row[] {
    return rows.filter((row) => removes(row, ticks) && row.datapack?.changes === 'asks');
}

const NO_FIELD: ResetField = { saveAs: '', drop: false };

/** What step 2 holds for one project's pack: the new pack's name, or that its changes go. */
export function fieldOf(fields: ResetFields, path: string): ResetField {
    return fields[path] ?? NO_FIELD;
}

/** The step 2 rows whose new name another row above already uses, ignoring case and spaces. */
export function duplicateNamePaths(rows: readonly PackRow[], ticks: RemoveTicks, fields: ResetFields): Set<string> {
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
export function discardColumnState(rows: readonly PackRow[], fields: ResetFields): ColumnState {
    const dropped = rows.filter((row) => fieldOf(fields, row.path).drop).length;
    return { offered: rows.length > 0, all: rows.length > 0 && dropped === rows.length, some: dropped > 0 };
}

/** The header discards every row's changes when not all are, else none; typed names are kept. */
export function toggleDiscardColumn(rows: readonly PackRow[], fields: ResetFields): ResetFields {
    const drop = !discardColumnState(rows, fields).all;
    return { ...fields, ...Object.fromEntries(rows.map((row) => [row.path, { ...fieldOf(fields, row.path), drop }])) };
}

/** A batch may run once every pack that asks has a unique name, or has its changes discarded. */
export function changesAreAnswered(rows: readonly PackRow[], ticks: RemoveTicks, fields: ResetFields): boolean {
    const dupes = duplicateNamePaths(rows, ticks, fields);
    return changeRows(rows, ticks).every((row) => {
        const field = fieldOf(fields, row.path);
        return field.drop || (field.saveAs.trim().length > 0 && !dupes.has(row.path));
    });
}

/** Step 2's answer for a pack whose data goes: a name to save its changes as, or `drop`; none when it does not ask. */
function changesAnswer(row: PackRow, fields: ResetFields): Pick<BatchResetAnswer, 'changes'> {
    if (row.datapack?.changes !== 'asks') return {};
    const field = fieldOf(fields, row.path);
    return { changes: field.drop ? 'drop' : { saveAs: field.saveAs.trim() } };
}

/** One answer per project: keep the pack, remove it, or remove it after saving or dropping its changes. */
export function resetAnswers(rows: readonly BatchResetRow[], ticks: RemoveTicks, fields: ResetFields): BatchResetAnswer[] {
    return rows.map((row) =>
        removes(row, ticks) ? { path: row.path, removeDatapack: true, ...changesAnswer(row, fields) } : { path: row.path, removeDatapack: false },
    );
}

/** The delete's answers, one per project in the order shown, step 2's with each pack whose data goes. */
export function deleteAnswers(rows: readonly BatchDeleteRow[], ticks: DeleteTicks, fields: ResetFields): BatchDeleteAnswer[] {
    const removing = dataTicks(rows, ticks);
    return rows.map((row) => ({
        path: row.path,
        deleteGitHubRepo: row.repo !== undefined && ticks[row.path]?.repo === true,
        deleteDaLiveSite: row.site !== undefined && ticks[row.path]?.site === true,
        removeDatapackData: removes(row, removing),
        ...(removes(row, removing) ? changesAnswer(row, fields) : {}),
    }));
}
