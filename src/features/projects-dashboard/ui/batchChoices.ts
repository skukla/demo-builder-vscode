/**
 * What the batch window's questions hold, and the answers built from them (owner, 2026-11-04):
 * Delete Selected's boxes, one per project per thing it may take (its repository, its DA.live site,
 * its datapack's data), and Reset Selected's Uninstall Datapack box per project. When a pack whose
 * data goes has changes, the red button runs into "Save Your Changes First?" (step-05 S1, decisions
 * J7-2): a row per such pack, each a filled-in name. The SC's own starts with its own name and saves
 * into it; another name, or someone else's pack, saves a new datapack, starting "My Bodea" or
 * "My Bodea 2" when taken. Pure, so the screen and its tests share one reading.
 *
 * @module features/projects-dashboard/ui/batchChoices
 */

import { type ChangesByPath, type PackRow, type SaveNames, type SaveQuestion, nameProblems, namesOf } from '@/features/data-installer/saveAsName';
import type {
    BatchDatapack,
    BatchDeleteAnswer,
    BatchDeleteRow,
    BatchResetAnswer,
    BatchResetRow,
    PrepareProjectsBatchResponse,
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

/** A delete's Uninstall Datapack boxes, as the save question reads them. */
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

/**
 * The save question's rows: each pack whose data goes with changes, the SC's own included, except
 * theirs when the setting saves it without asking (P5-Q6, Switch's `mustAsk`). A pack whose changes
 * could not be read has no box, so its data stays and nothing is asked (P5-Q5 open).
 */
export function saveRows<Row extends PackRow>(rows: readonly Row[], ticks: RemoveTicks, alwaysSave: boolean): Row[] {
    return rows.filter((row) => removes(row, ticks) && (row.datapack?.changes === 'asks' || (row.datapack?.changes === 'saves' && !alwaysSave)));
}

/** Whose pack's data goes, by project path: a delete's Uninstall Datapack boxes, a reset's. */
export function removingOf(questions: PrepareProjectsBatchResponse, ticks: DeleteTicks, removeTicks: RemoveTicks): RemoveTicks {
    return questions.action === 'delete' ? dataTicks(questions.rows, ticks) : removeTicks;
}

/** What the SC has chosen that the save question reads. */
export interface SaveChosen {
    ticks: DeleteTicks;
    removeTicks: RemoveTicks;
    typedNames: SaveNames;
}

/** The save question for these questions and choices; no rows when nothing needs asking. */
export function saveQuestionOf(questions: PrepareProjectsBatchResponse, chosen: SaveChosen): SaveQuestion {
    const removing = removingOf(questions, chosen.ticks, chosen.removeTicks);
    const rows: PackRow[] = saveRows<PackRow>(questions.rows, removing, questions.alwaysSave);
    const names = namesOf(rows, questions.ownNames, chosen.typedNames);
    return { rows, names, problems: nameProblems(rows, names, questions.ownNames) };
}

/** A pack whose data goes carries the save question's answer, when it has one. */
function changesAnswer(path: string, changes: ChangesByPath): Pick<BatchResetAnswer, 'changes'> {
    const answer = changes[path];
    return answer ? { changes: answer } : {};
}

/** One answer per project: keep the pack, remove it, or remove it after saving or dropping its changes. */
export function resetAnswers(rows: readonly BatchResetRow[], ticks: RemoveTicks, changes: ChangesByPath): BatchResetAnswer[] {
    return rows.map((row) =>
        removes(row, ticks) ? { path: row.path, removeDatapack: true, ...changesAnswer(row.path, changes) } : { path: row.path, removeDatapack: false },
    );
}

/** The delete's answers, one per project in the order shown, the save question's with each pack whose data goes. */
export function deleteAnswers(rows: readonly BatchDeleteRow[], ticks: DeleteTicks, changes: ChangesByPath): BatchDeleteAnswer[] {
    const removing = dataTicks(rows, ticks);
    return rows.map((row) => ({
        path: row.path,
        deleteGitHubRepo: row.repo !== undefined && ticks[row.path]?.repo === true,
        deleteDaLiveSite: row.site !== undefined && ticks[row.path]?.site === true,
        removeDatapackData: removes(row, removing),
        ...(removes(row, removing) ? changesAnswer(row.path, changes) : {}),
    }));
}
