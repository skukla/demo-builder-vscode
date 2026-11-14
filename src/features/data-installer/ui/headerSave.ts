/**
 * Which save button the Datapacks header draws (step-04 S1; decisions Phase 7 and 7b).
 *
 * One state, decided before anything is drawn, because a button's words never change while it is
 * on screen (7b): until both the project and the catalog have answered it is the house pending
 * button, never another label first.
 *
 * - `create`: the project holds no datapack, or one with no install record, so nothing a save could
 *   count (step-07 P3, owner 2026-11-14). The button reads Create, with no line saying why (rule 6).
 * - `save-menu`: the project holds the SC's own library datapack and Demo Builder installed it.
 *   Save ▾, with Save and Save As New.
 * - `save-as-new`: it holds someone else's (a team pack, a colleague's, the Data Installer's),
 *   installed. A plain Save As New.
 *
 * @module features/data-installer/ui/headerSave
 */

import type { CatalogPage } from '../types';
import { storeOf, type DatapackStoreName, type ProjectDatapack } from '@/types/datapack';

/** What decides where a save of the demo's datapack goes: its name, and whose it is. */
export interface HeldPackInfo {
    displayName: string;
    store?: DatapackStoreName;
    mine?: boolean;
    team?: boolean;
}

/** The header's save button, as one state. */
export type HeaderSave = 'pending' | 'create' | 'save-menu' | 'save-as-new';

export interface HeaderSaveInput {
    /** The project read has answered, either way. */
    projectAnswered: boolean;
    /** The catalog read has answered, either way. */
    catalogAnswered: boolean;
    /** The datapack the project holds. */
    held?: ProjectDatapack;
    /** When Demo Builder's engine installed it: its install record. */
    installedAt?: string;
    /** The held datapack as the catalog lists it, when it does. */
    heldInCatalog?: HeldPackInfo;
}

/**
 * Whether a save goes INTO the held datapack, as a new version: only the SC's own library pack, not
 * a team pack (owner, 2026-11-09, walk F83). The server decides the same (`saveIntoFor`).
 *
 * @param held - the datapack the project holds
 * @param info - that datapack as the catalog lists it
 * @returns true when a save writes a new version of it
 */
export function savesInto(held: ProjectDatapack, info: HeldPackInfo): boolean {
    // A datapack recorded with no store is a Data Installer one (`storeOf`), as heldInCatalogOf reads it.
    return storeOf(held) === 'library' && info.mine === true && info.team !== true;
}

/**
 * @param input - what has answered, and what the project holds
 * @returns the header's save button
 */
export function headerSave(input: HeaderSaveInput): HeaderSave {
    const { projectAnswered, catalogAnswered, held, installedAt, heldInCatalog } = input;
    if (!projectAnswered || !catalogAnswered) return 'pending';
    if (!held || installedAt === undefined) return 'create';
    return heldInCatalog && savesInto(held, heldInCatalog) ? 'save-menu' : 'save-as-new';
}

/**
 * The demo's pack as the catalog lists it: what decides the header's save button (whose it is) and
 * names it. Its version when listed, else any version of it.
 */
export function heldInCatalogOf(page: CatalogPage | null, held: ProjectDatapack | undefined): HeldPackInfo | undefined {
    if (!held) return undefined;
    const ofHeld = (page?.items ?? []).filter((item) => item.id.name === held.name && (item.store ?? 'installer') === (held.store ?? 'installer'));
    const item = ofHeld.find((each) => each.id.version === held.version) ?? ofHeld[0];
    if (!item) return undefined;
    return { displayName: item.displayName, store: item.store, mine: item.mine, team: item.team };
}
