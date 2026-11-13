/**
 * The name a new datapack of the SC's is saved under: the save question's when the held datapack is
 * not theirs (step 03, S6; the owner's Q1 choice, following J7-2), and Save As New's (step-04 S2,
 * J3-1). It starts "My Bodea", or "My Bodea 2" when that is taken, and a name that is empty or
 * already one of theirs is refused: on screen, and by the save itself (`packSave.ts`).
 *
 * Pure: the webview and the extension share it.
 *
 * @module features/data-installer/saveAsName
 */

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
