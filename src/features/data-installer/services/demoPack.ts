/**
 * Where a save from a demo goes: Save and Save As (owner, 2026-11-03,
 * `.rptc/plans/datapack-save-as/`).
 *
 * The demo's pack is `project.datapack`: the pack it installs from and resets to.
 *
 * - **Save** writes a new version of that pack, when it is the SC's own. Someone else's pack
 *   (Bodea, a colleague's) is never written.
 * - **Save As** makes a new pack of the SC's, under the name they typed, and the demo then
 *   uses it.
 *
 * There is no pack made for a demo without being asked: the automatic, project-named pack this
 * module made until 2026-11-03 was invisible in use.
 *
 * - **A new pack's name** in the library is generated from the name typed, a slug plus a short
 *   random suffix. The library's names cannot be changed and it has no "is this name taken"
 *   read, so a generated name cannot land on a colleague's. What the SC sees is the name they
 *   typed, the pack's display name.
 * - **The pack a saved one was made from** (`origin`) is carried from save to save, so a
 *   colleague whose copy of a project cannot read this pack can carry on with that one.
 *
 * @module features/data-installer/services/demoPack
 */

import { randomBytes } from 'crypto';
import type { DataInstallerClient } from './dataInstallerClient';
import type { Project } from '@/types/base';
import type { DatapackId, DatapackLocation } from '@/types/datapack';

/** How many hex characters a new pack's name carries after its slug. */
const NAME_SUFFIX_LENGTH = 6;

/** The longest slug a new pack's name starts with. */
const NAME_SLUG_LENGTH = 40;

/** What one save writes: the new version, what it is called, and the pack it was made from. */
export interface DemoPackSave {
    id: DatapackId;
    displayName: string;
    origin?: DatapackLocation;
}

/** Where a save goes: an existing pack of the SC's by its name (Save), or a new one (Save As). */
export interface SaveInto {
    /** The pack's name in the library, for Save. Absent for Save As, which makes one. */
    name?: string;
    /** What the SC sees it called. */
    displayName: string;
}

function randomSuffix(): string {
    return randomBytes(NAME_SUFFIX_LENGTH).toString('hex').slice(0, NAME_SUFFIX_LENGTH);
}

/**
 * A new pack's name in the library, from the name the SC typed: "My Bodea" → `my-bodea-3f9a1c`.
 *
 * @param displayName - the name typed
 * @param suffix - the random part (a test fixes it)
 */
export function packIdFor(displayName: string, suffix: string = randomSuffix()): string {
    const slug = displayName
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-+|-+$/gu, '')
        .slice(0, NAME_SLUG_LENGTH)
        .replace(/-+$/u, '');
    return `${slug || 'datapack'}-${suffix}`;
}

/** The name Save As starts with: the pack's own with "Copy", or empty when there is none. */
export function copyNameFor(displayName: string | undefined): string {
    return displayName ? `${displayName} Copy` : '';
}

/** A save's version: the UTC time to the second, as `YYYYMMDD-HHMMSS`. */
export function savedVersion(at: Date): string {
    return at.toISOString().replace(/[-:]/gu, '').replace('T', '-').slice(0, 15);
}

/**
 * The pack the saved one is made from: what the project records it came from, else the pack
 * installed, unless that is the pack being saved into.
 */
function originFor(project: Project, installed: DatapackLocation | undefined, intoName: string): DatapackLocation | undefined {
    if (!installed) return undefined;
    const recorded = project.datapack;
    const isRecorded = recorded?.name === installed.name && recorded.version === installed.version;
    if (isRecorded && recorded?.origin) return recorded.origin;
    return installed.name === intoName ? undefined : installed;
}

/**
 * What a save from this project writes.
 *
 * @param project - the project saving
 * @param installed - the pack installed in its store, and the store that holds it; none for a
 *   save of picks from a store Demo Builder did not fill, made from nothing
 * @param into - where it goes: a pack of the SC's (Save), or a new one (Save As)
 * @param at - when
 */
export function planSave(project: Project, installed: DatapackLocation | undefined, into: SaveInto, at: Date): DemoPackSave {
    const name = into.name ?? packIdFor(into.displayName);
    const origin = originFor(project, installed, name);
    return {
        id: { name, version: savedVersion(at) },
        displayName: into.displayName,
        ...(origin ? { origin } : {}),
    };
}

/** Record a save on the project: the new version is the pack it installs from and resets to. */
export function recordSave(project: Project, save: DemoPackSave): void {
    project.datapack = { ...save.id, store: 'library', ...(save.origin ? { origin: save.origin } : {}) };
}

/**
 * The signed-in SC's own versions of a library pack, asked of the library by name.
 *
 * @param client - the library's reads
 * @param name - the pack's name
 */
export async function myVersions(client: Pick<DataInstallerClient, 'findDatapacks'>, name: string): Promise<DatapackId[]> {
    const page = await client.findDatapacks({ datapackName: name });
    return page.items.filter((item) => item.mine === true && item.id.name === name).map((item) => item.id);
}
