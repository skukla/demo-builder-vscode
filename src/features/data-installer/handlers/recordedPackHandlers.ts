/**
 * The live wiring behind a project's recorded pack (datapack-engine step 07):
 *
 * - `check-recorded-datapack`: can the pack a project records be read, and what would creation
 *   install instead? The wizard's Datapacks step asks it for an imported or copied project's
 *   pack, and shows the answer's sentence. Writes nothing.
 * - `arrivalDepsFor`: the same check, and the copy into this SC's library, for creation's own
 *   settle step (`settleArrivingPack`), so the step and the build agree.
 *
 * @module features/data-installer/handlers/recordedPackHandlers
 */

import type { ArrivalDeps } from '../services/arrivingPack';
import { readPackFromStore, writePackToStore } from '../services/datapackTransfer';
import { type PackReads, checkRecordedPack, packReadsVia } from '../services/recordedPack';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import { openLibraryWriter } from './libraryWriter';
import type { ProjectDatapack } from '@/types/datapack';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

/** Both stores' reads, as the check needs them. */
export function packReadsFor(context: HandlerContext): PackReads {
    return packReadsVia((store) => resolveDataInstallerAccess(context, store));
}

/** The check and the copy creation's settle step runs. */
export function arrivalDepsFor(context: HandlerContext): ArrivalDeps {
    return {
        check: (recorded) => checkRecordedPack(packReadsFor(context), recorded),
        copy: async (from, to) => {
            const library = await openLibraryWriter(context);
            if (!library.ok) throw new Error(library.reason);
            const file = await readPackFromStore(library.client, from, 'library');
            // No `update`: the demo's own pack is new, so nothing in the library is written over.
            const outcome = await writePackToStore(library.writer, { ...file, id: to.id, displayName: to.displayName });
            if (outcome.failed.length > 0) {
                throw new Error(outcome.failed.map((f) => `${f.dataType}: ${f.reason}`).join('; '));
            }
        },
    };
}

/** What the step sends: the pack the wizard holds. */
export interface CheckRecordedDatapackPayload {
    datapack?: Partial<ProjectDatapack>;
}

function recordedFrom(payload?: CheckRecordedDatapackPayload): ProjectDatapack | undefined {
    const pack = payload?.datapack;
    if (!pack?.name || !pack.version) return undefined;
    if (pack.store !== undefined && pack.store !== 'installer' && pack.store !== 'library') return undefined;
    return { ...pack, name: pack.name, version: pack.version };
}

export const recordedPackHandlers = defineHandlers({
    'check-recorded-datapack': async (
        context: HandlerContext,
        payload?: CheckRecordedDatapackPayload,
    ): Promise<HandlerResponse> => {
        const recorded = recordedFrom(payload);
        if (!recorded) return { success: false, error: 'A datapack name and version, and a known store, are required.' };
        return { success: true, data: await checkRecordedPack(packReadsFor(context), recorded) };
    },
});
