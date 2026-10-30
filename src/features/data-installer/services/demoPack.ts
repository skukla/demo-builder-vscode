/**
 * Each demo has its own pack (datapack-engine step 07, owner 2026-10-27).
 *
 * A shared library pack (Bodea) is a template. A demo built from it gets its own pack,
 * and every save from that demo goes there, so one SC's customer edits never change the
 * team's Bodea. The demo's pack is made at its first save, so a demo with no edits never
 * has one; each later save is a new version of it.
 *
 * - **Its name** in the library is the project's slug plus a short hash of where and when
 *   the project was made, fixed at the first save (`project.ownDatapack`): the library's
 *   names are unique across everyone's packs and cannot be changed. What the SC sees is
 *   its display name, which is the project's until the SC renames the pack.
 * - **The pack it was made from** (`origin`) is carried from save to save, so a colleague
 *   whose copy of a project cannot read this pack can carry on with that one.
 *
 * @module features/data-installer/services/demoPack
 */

import type { DataInstallerClient } from './dataInstallerClient';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import { sha256 } from '@/core/utils/sha256';
import type { Project } from '@/types/base';
import type { DatapackId, DatapackLocation } from '@/types/datapack';

/** How many hex characters of the hash a new pack's name carries. */
const NAME_HASH_LENGTH = 6;

/** What one save writes: the new version, what it is called, and the pack it was made from. */
export interface DemoPackSave {
    id: DatapackId;
    displayName: string;
    origin?: DatapackLocation;
}

/**
 * The name of this demo's own pack: the one recorded, else a new one.
 *
 * @param project - the project saving
 */
export function ownPackName(project: Pick<Project, 'name' | 'path' | 'created' | 'ownDatapack'>): string {
    if (project.ownDatapack) return project.ownDatapack.name;
    const made = project.created instanceof Date ? project.created.toISOString() : String(project.created);
    return `${project.name}-${sha256(`${project.path}|${made}`).slice(0, NAME_HASH_LENGTH)}`;
}

/** A save's version: the UTC time to the second, as `YYYYMMDD-HHMMSS`. */
export function savedVersion(at: Date): string {
    return at.toISOString().replace(/[-:]/gu, '').replace('T', '-').slice(0, 15);
}

/**
 * The pack the saved one is made from: what the project records it came from, else the
 * pack installed, unless that is the demo's own pack already.
 */
function originFor(project: Project, installed: DatapackLocation | undefined, ownName: string): DatapackLocation | undefined {
    if (!installed) return undefined;
    const recorded = project.datapack;
    const isRecorded = recorded?.name === installed.name && recorded.version === installed.version;
    if (isRecorded && recorded?.origin) return recorded.origin;
    return installed.name === ownName ? undefined : installed;
}

/**
 * What a save of the store's copy of `installed` writes, for this project.
 *
 * @param project - the project saving
 * @param installed - the pack installed in its store, and the store that holds it; none for a
 *   save of picks from a store Demo Builder did not fill (step 14), made from nothing
 * @param at - when
 */
export function demoPackSaveFor(project: Project, installed: DatapackLocation | undefined, at: Date): DemoPackSave {
    const name = ownPackName(project);
    const own = project.ownDatapack;
    const kept = own?.renamed === true ? own.displayName : undefined;
    const origin = originFor(project, installed, name);
    return {
        id: { name, version: savedVersion(at) },
        displayName: kept ?? getProjectDisplayName(project),
        ...(origin ? { origin } : {}),
    };
}

/** Record a save on the project: the new version is its pack, and the demo's own. */
export function recordDemoPackSave(project: Project, save: DemoPackSave): void {
    project.datapack = { ...save.id, store: 'library', ...(save.origin ? { origin: save.origin } : {}) };
    recordOwnPackName(project, save);
}

/**
 * Record only the demo's own pack (step 14): a save of picks from a store Demo Builder did not
 * fill makes a version of it, but the store is not that version (nothing of it is on an install
 * record), so the pack the project installs from stays as it was.
 */
export function recordOwnPackName(project: Project, save: DemoPackSave): void {
    project.ownDatapack = {
        name: save.id.name,
        displayName: save.displayName,
        ...(project.ownDatapack?.renamed ? { renamed: true } : {}),
    };
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
