/**
 * The datapack library's pack names, remembered once read (owner, 2026-11-08, walk F69).
 *
 * A project records its pack by id ("luma"); the name the SC knows ("Luma") lives in the library,
 * one network read away. The dashboard's Datapacks card asked for it each time it drew, so the card
 * showed no line for a moment and then gained one. A name read once is kept here, so the card
 * shows it at once and the read that follows only keeps it current. A rename made here records the
 * new name as it lands.
 *
 * Kept in global state: a pack's name is the same in every project and survives a window reload. So
 * is how many versions it offers (step-07 P4), which the same read answers.
 *
 * @module features/data-installer/services/packNames
 */

/** The global state key holding pack id to display name. */
export const PACK_NAMES_KEY = 'demoBuilder.datapackNames';

/** What this reads and writes: the extension's global state. */
export interface NameMemory {
    get<T>(key: string): T | undefined;
    update(key: string, value: unknown): Thenable<void>;
}

function names(memory: NameMemory): Record<string, string> {
    return memory.get<Record<string, string>>(PACK_NAMES_KEY) ?? {};
}

/** The library pack's name as last read, or undefined when it was never read here. */
export function rememberedPackName(memory: NameMemory, packName: string): string | undefined {
    return names(memory)[packName];
}

/** Keep a library pack's name. Writes only when it changed. */
export async function rememberPackName(
    memory: NameMemory,
    packName: string,
    displayName: string,
): Promise<void> {
    const known = names(memory);
    if (known[packName] === displayName) return;
    await memory.update(PACK_NAMES_KEY, { ...known, [packName]: displayName });
}

/** The global state key holding pack id to how many versions it offers (step-07 P4). */
export const PACK_CHOICES_KEY = 'demoBuilder.datapackVersionChoices';

function choices(memory: NameMemory): Record<string, number> {
    return memory.get<Record<string, number>>(PACK_CHOICES_KEY) ?? {};
}

/**
 * How many versions a library pack offered when last read (`versionChoices`), or undefined when it
 * was never read here. The dashboard line names the version only with two or more (S9).
 */
export function rememberedPackChoices(memory: NameMemory, packName: string): number | undefined {
    return choices(memory)[packName];
}

/** Keep how many versions a library pack offers, beside its name. Writes only when it changed. */
export async function rememberPackChoices(memory: NameMemory, packName: string, count: number): Promise<void> {
    const known = choices(memory);
    if (known[packName] === count) return;
    await memory.update(PACK_CHOICES_KEY, { ...known, [packName]: count });
}
