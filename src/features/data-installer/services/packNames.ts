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
 * is how many versions it offers (step-07 P4), which the same read answers, and its newest save (walk
 * F218), so the dashboard's tile says a newer version waits without a read of its own.
 *
 * @module features/data-installer/services/packNames
 */

/** The global state key holding pack id to display name. */
export const PACK_NAMES_KEY = 'demoBuilder.datapackNames';

import { newestOwnSave } from '../packVersions';
import type { DatapackSummary } from '../types';

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

/**
 * Keep every listed pack's name in one write (owner, 2026-11-16): the steps and sentences that name
 * a pack ("Installing Frescopa") read it here, and a pack the SC had only seen listed had no name
 * kept. Writes only when something changed.
 */
export async function rememberPackNames(
    memory: NameMemory,
    listed: ReadonlyArray<{ id: { name: string }; displayName?: string }>,
): Promise<void> {
    const known = names(memory);
    const fresh = listed.filter((item) => item.displayName && known[item.id.name] !== item.displayName);
    if (fresh.length === 0) return;
    const added = Object.fromEntries(fresh.map((item) => [item.id.name, item.displayName as string]));
    await memory.update(PACK_NAMES_KEY, { ...known, ...added });
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

/** The global state key holding pack id to its newest save seen (walk F218). */
export const PACK_NEWEST_SAVE_KEY = 'demoBuilder.datapackNewestSaves';

function newestSaves(memory: NameMemory): Record<string, string> {
    return memory.get<Record<string, string>>(PACK_NEWEST_SAVE_KEY) ?? {};
}

/** A library pack's newest save of the SC's own or Demo Builder's, as last seen, or undefined. */
export function rememberedNewestSave(memory: NameMemory, packName: string): string | undefined {
    return newestSaves(memory)[packName];
}

/**
 * Keep each listed pack's newest save, never going back to an older one: a list, the read behind the
 * dashboard's line and a save each tell it. One write, and none when nothing is newer.
 */
export async function rememberNewestSaves(
    memory: NameMemory,
    listed: ReadonlyArray<Pick<DatapackSummary, 'id' | 'mine' | 'team'>>,
): Promise<void> {
    const known = newestSaves(memory);
    const fresh: Record<string, string> = {};
    for (const name of new Set(listed.map((item) => item.id.name))) {
        const newest = newestOwnSave(name, listed);
        if (newest !== undefined && (known[name] === undefined || newest > known[name])) fresh[name] = newest;
    }
    if (Object.keys(fresh).length === 0) return;
    await memory.update(PACK_NEWEST_SAVE_KEY, { ...known, ...fresh });
}
