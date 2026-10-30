/**
 * Can a project's recorded pack be read, and what is installed when it cannot (datapack-engine
 * step 07)?
 *
 * A project file or a copy names a pack by reference. By the time someone creates a project
 * from it, the pack may have gone (its owner deleted it) or never have been readable to them
 * (a library pack only its owner can read). Project creation does not stop: it carries on with
 * the pack the recorded one was made from, or that pack's newest version, or no sample data,
 * and says which. The Datapacks step shows the same sentence before creation, from the same
 * answer.
 *
 * "Not there" is a 404 from the store holding the pack; the library answers one for a pack it
 * holds no copy of that the caller may see (`get-datapack-metadata`). Any other failure means
 * the store could not be asked, so the pack is left as recorded and the install says what
 * happened.
 *
 * @module features/data-installer/services/recordedPack
 */

import type { DatapackSummary } from '../types';
import type { DataInstallerClient } from './dataInstallerClient';
import { DataInstallerApiError } from './dataInstallerErrors';
import { groupDatapacks, pickDefaultVersion } from './datapackCatalog';
import {
    type DatapackAvailability,
    type DatapackId,
    type DatapackLocation,
    type DatapackStoreName,
    type ProjectDatapack,
    type RecordedPackCheck,
    storeOf,
} from '@/types/datapack';

/** HTTP status a store answers for a pack it holds no copy of. */
const NOT_FOUND = 404;

/** The two reads the check makes, of either store. */
export interface PackReads {
    /** One version's catalog entry. Throws a 404 `DataInstallerApiError` when the store has none. */
    detail(id: DatapackId, store: DatapackStoreName): Promise<DatapackSummary>;
    /** Every version the store lists under a name. */
    versions(name: string, store: DatapackStoreName): Promise<DatapackSummary[]>;
}

/** One store's catalog reads, or a refusal (the handlers' access guard answers this shape). */
export type StoreAccess =
    | { ok: true; client: Pick<DataInstallerClient, 'getDatapackDetail' | 'findDatapacks'> }
    | { ok: false };

/**
 * Both stores' reads over an access guard. A store the guard refuses throws, which every reader
 * of {@link PackReads} takes as "could not ask".
 *
 * @param open - the guard, per store
 */
export function packReadsVia(open: (store: DatapackStoreName) => Promise<StoreAccess>): PackReads {
    const clientOf = async (store: DatapackStoreName) => {
        const access = await open(store);
        if (!access.ok) throw new Error(`The ${store === 'library' ? 'datapack library' : 'Data Installer'} is not reachable.`);
        return access.client;
    };
    return {
        detail: async (id, store) => (await clientOf(store)).getDatapackDetail(id),
        versions: async (name, store) => (await (await clientOf(store)).findDatapacks({ datapackName: name })).items,
    };
}

/** The detail, or `null` when the store says it has none; anything else throws. */
async function find(reads: PackReads, pack: DatapackLocation): Promise<DatapackSummary | null> {
    try {
        return await reads.detail({ name: pack.name, version: pack.version }, storeOf(pack));
    } catch (error) {
        if (error instanceof DataInstallerApiError && error.status === NOT_FOUND) return null;
        throw error;
    }
}

const located = (summary: DatapackSummary, store: DatapackStoreName): ProjectDatapack => ({ ...summary.id, store });

/** The newest version the store lists of a name, or none. */
async function newest(reads: PackReads, origin: DatapackLocation): Promise<DatapackSummary | undefined> {
    const store = storeOf(origin);
    const listed = (await reads.versions(origin.name, store)).filter((row) => row.id.name === origin.name);
    const [group] = groupDatapacks(listed.map((row) => ({ ...row, store })));
    const version = group ? pickDefaultVersion(group) : undefined;
    return group?.versions.find((row) => row.id.version === version);
}

/**
 * The recorded pack and the store that has it. A pack recorded with no store is asked of the Data
 * Installer, as before, then of the library: projects saved before the store was recorded name
 * library versions too (rule 3, no migration), and the answer names the store it was found in.
 */
async function locate(reads: PackReads, recorded: ProjectDatapack): Promise<{ pack: ProjectDatapack; found: DatapackSummary } | null> {
    const found = await find(reads, recorded);
    if (found) return { pack: recorded, found };
    if (recorded.store !== undefined) return null;
    const inLibrary = await find(reads, { ...recorded, store: 'library' });
    return inLibrary ? { pack: { ...recorded, store: 'library' }, found: inLibrary } : null;
}

/** The pack it was made from, its newest version, or nothing: what a fallback can install. */
async function fallbackFor(reads: PackReads, recorded: ProjectDatapack, unreadable: string): Promise<RecordedPackCheck> {
    const origin = recorded.origin;
    if (!origin) return { verdict: 'none', note: `${unreadable} This project will be created without sample data.` };
    const same = await find(reads, origin);
    if (same) {
        return {
            verdict: 'fallback',
            pack: located(same, storeOf(origin)),
            displayName: same.displayName,
            note: `${unreadable} You can continue with ${same.displayName}, the pack it was made from; their changes won't be included.`,
        };
    }
    const latest = await newest(reads, origin);
    if (!latest) {
        return {
            verdict: 'none',
            note: `${unreadable} The pack it was made from, ${origin.name}, has gone too, so this project will be created without sample data.`,
        };
    }
    return {
        verdict: 'fallback',
        pack: located(latest, storeOf(origin)),
        displayName: latest.displayName,
        note:
            `${unreadable} ${latest.displayName} version ${origin.version} has gone too, so its newest version, ` +
            `${latest.id.version}, is used; their changes won't be included.`,
    };
}

/**
 * Check a recorded pack, and say what creation installs.
 *
 * @param reads - the two stores' reads
 * @param recorded - the pack the project records
 */
export async function checkRecordedPack(reads: PackReads, recorded: ProjectDatapack): Promise<RecordedPackCheck> {
    try {
        const located = await locate(reads, recorded);
        if (located) {
            return {
                verdict: 'readable',
                pack: located.pack,
                displayName: located.found.displayName,
                mine: located.found.mine === true,
                shared: located.found.shared,
            };
        }
        const unreadable = `The ${recorded.name} pack this project uses can't be read: its owner has deleted it or not shared it.`;
        return await fallbackFor(reads, recorded, unreadable);
    } catch {
        return { verdict: 'unknown' };
    }
}


/**
 * Ask both stores for a pack by name AND version: the store it records first, then the other,
 * since a pack saved before the store was recorded may be a library version.
 *
 * @returns where it is, or undefined when a store could not be asked and none had it
 */
export async function availabilityOf(reads: PackReads, pack: DatapackLocation): Promise<DatapackAvailability | undefined> {
    const first = storeOf(pack);
    const stores: DatapackStoreName[] = [first, first === 'library' ? 'installer' : 'library'];
    let unasked = false;
    for (const store of stores) {
        try {
            const found = await find(reads, { name: pack.name, version: pack.version, store });
            if (!found) continue;
            if (store === 'installer') return 'installer';
            return found.shared ? 'library-shared' : 'library-yours-only';
        } catch {
            unasked = true;
        }
    }
    return unasked ? undefined : 'missing';
}
