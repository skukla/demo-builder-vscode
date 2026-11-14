/**
 * The name a new datapack of the SC's is saved under: the save question's when the held datapack is
 * not theirs (step 03, S6; the owner's Q1 choice, following J7-2), and Save As New's (step-04 S2,
 * J3-1). It starts "My Bodea", or "My Bodea 2" when that is taken, and a name that is empty or
 * already one of theirs is refused: on screen, and by the save itself (`packSave.ts`).
 *
 * The batch save question's rules live here too (step-05 S1, J7-2): a row per datapack with changes,
 * each a filled-in name, the SC's own starting with its own name, someone else's with "My <Pack>";
 * the names refused, and the answers sent. The projects screens' Reset and Delete ask it, and so does
 * Clear Commerce Instance (step 06 C4, P6-Q4).
 *
 * Pure: the webview and the extension share it.
 *
 * @module features/data-installer/saveAsName
 */

import type { BatchDatapack } from '@/types/projectsBatch';

const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** "My <Datapack>", counting on (" 2", " 3" …) past the names already taken. */
export function freeName(datapack: string, taken: readonly string[]): string {
    const base = `My ${datapack}`;
    const isTaken = (name: string): boolean => taken.some((each) => sameName(each, name));
    let name = base;
    for (let n = 2; isTaken(name); n += 1) name = `${base} ${n}`;
    return name;
}

/** Why the name cannot be used, as the house problem line says it; none when it can. */
export function nameProblem(name: string, taken: readonly string[]): string | undefined {
    const trimmed = name.trim();
    if (trimmed === '') return 'Give it a name.';
    if (taken.some((each) => sameName(each, trimmed))) return `You already have a datapack named ${trimmed}.`;
    return undefined;
}

/** The longest reason {@link nameProblem} could give against these names: the room kept under a name field. */
export function longestNameProblem(taken: readonly string[]): string {
    const reasons = [nameProblem('', []) ?? '', ...taken.map((name) => nameProblem(name, [name]) ?? '')];
    return reasons.reduce((longest, each) => (each.length > longest.length ? each : longest), '');
}

/** A project whose datapack's changes the save question asks about: a batch's row, or Clear Commerce Instance's. */
export interface PackRow {
    path: string;
    name: string;
    datapack?: BatchDatapack;
}

/** The save question's answer for one pack: a new datapack's name, or its changes lost. */
export type BatchChanges = { saveAs: string } | 'drop';

/** The save question's answers, by project path; a pack saved into itself has none. */
export type ChangesByPath = Readonly<Record<string, BatchChanges>>;

/** The names in the save question's fields, by project path. */
export type SaveNames = Readonly<Record<string, string>>;

/** The SC's own pack: a save goes into it (`saves`), where someone else's makes a new one (`asks`). */
const isOwn = (row: PackRow): boolean => row.datapack?.changes === 'saves';

/**
 * Each row's name: what was typed, else where it starts. The SC's own starts with its own name;
 * someone else's with "My <Pack>", counting on past their datapacks and the rows above.
 */
export function namesOf(rows: readonly PackRow[], ownNames: readonly string[], typed: SaveNames): Record<string, string> {
    const names: Record<string, string> = {};
    for (const row of rows) {
        const pack = row.datapack?.name ?? '';
        names[row.path] = typed[row.path] ?? (isOwn(row) ? pack : freeName(pack, [...ownNames, ...Object.values(names)]));
    }
    return names;
}

/** A row saving into the SC's own pack under its own name (the run saves into it, `changesOf`). */
function savesIntoOwn(row: PackRow, names: SaveNames): boolean {
    return isOwn(row) && sameName(names[row.path] ?? '', row.datapack?.name ?? '');
}

/**
 * The names a row may not take: the SC's datapacks, less its own pack (it saves into it), and the
 * other rows'. Two projects saving into the same own pack under its own name do not clash: each
 * saves into it, one after the other (review of step-05 S1).
 */
function takenFor(row: PackRow, rows: readonly PackRow[], names: SaveNames, ownNames: readonly string[]): string[] {
    const own = isOwn(row) ? (row.datapack?.name ?? '') : undefined;
    const sharesOwn = (other: PackRow): boolean =>
        own !== undefined && savesIntoOwn(row, names) && savesIntoOwn(other, names) && sameName(other.datapack?.name ?? '', own);
    return [
        ...ownNames.filter((name) => own === undefined || !sameName(name, own)),
        ...rows.filter((other) => other.path !== row.path && !sharesOwn(other)).map((other) => names[other.path] ?? ''),
    ];
}

/** Why each row's name cannot be used, by project path; a row whose name can is absent. */
export function nameProblems(rows: readonly PackRow[], names: SaveNames, ownNames: readonly string[]): Record<string, string> {
    const problems: Record<string, string> = {};
    for (const row of rows) {
        const problem = nameProblem(names[row.path] ?? '', takenFor(row, rows, names, ownNames));
        if (problem) problems[row.path] = problem;
    }
    return problems;
}

/**
 * The save question answered. Saved: the SC's own pack under its own name sends nothing (the run
 * saves into it), any other name a new datapack's, trimmed; never the own name as `saveAs`, which
 * the save refuses as taken. Without saving: every row's changes go.
 */
export function changesOf(rows: readonly PackRow[], names: SaveNames, answer: 'save' | 'drop'): ChangesByPath {
    const changes: Record<string, BatchChanges> = {};
    for (const row of rows) {
        const name = (names[row.path] ?? '').trim();
        if (answer === 'drop') changes[row.path] = 'drop';
        else if (!(isOwn(row) && sameName(name, row.datapack?.name ?? ''))) changes[row.path] = { saveAs: name };
    }
    return changes;
}

/** The save question over the questions as answered: its rows, each row's name, and why a name is refused. */
export interface SaveQuestion {
    rows: PackRow[];
    names: SaveNames;
    problems: Readonly<Record<string, string>>;
}
