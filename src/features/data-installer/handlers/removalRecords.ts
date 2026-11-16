/**
 * Review Records for an uninstall (walk F151, owner yes 2026-11-16): what the uninstall would take
 * out and what it would keep, by data type and by name, before the one step that deletes.
 *
 * Read-only. The names come from the install record (each object's `key`, the name the pack gives
 * it); which stay is the uninstall's own decision, made the way the uninstall makes it
 * (`decideRemovals`, which reads the store and writes nothing): a category still holding products
 * the SC added, a root a store still uses. Settings are put back, never deleted, so they count as
 * going.
 *
 * @module features/data-installer/handlers/removalRecords
 */

import { type CreatedObject, nodeRecordFiles, readInstallRecord, removalOrder } from '../services/demoBuilderEngine/installRecord';
import { decideRemovals, keptObjects } from '../services/demoBuilderEngine/removers';
import { packKindOf } from '../services/demoBuilderEngine/storeCopies';
import { STORE_CONFIG_KIND } from '../services/demoBuilderEngine/storeConfigKind';
import { failure } from './packSave';
import { openProjectStore } from './storeChangesHandlers';
import type { DatapackId } from '@/types/datapack';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { DatapackRecordsResult } from '@/types/webviewRequests';

/** Each object's name by its data type, as the uninstall's table counts them (`packKindOf`). */
function namesByKind(objects: readonly CreatedObject[], named: (o: CreatedObject) => string): Record<string, string[]> {
    const byKind: Record<string, string[]> = {};
    for (const object of objects) (byKind[packKindOf(object.kind)] ??= []).push(named(object));
    return byKind;
}

/**
 * What an uninstall of `pack` would take and keep, or why it could not be read.
 *
 * @param pack - the datapack the demo holds, as its install record names it
 */
export async function readRemovalRecords(context: HandlerContext, pack: DatapackId): Promise<HandlerResponse> {
    const project = await context.stateManager.getCurrentProject();
    const record = project ? await readInstallRecord(nodeRecordFiles, project.path, pack) : undefined;
    if (!record) return { success: true, data: { records: {}, kept: {} } satisfies DatapackRecordsResult };
    // The uninstall's check reads Commerce, and keeps it for the uninstall after it (walk F128).
    const store = await openProjectStore(context, 'remember');
    if ('response' in store) return store.response;
    try {
        const commerce = await store.deps.commerce();
        if ('refusal' in commerce) return { success: false, error: commerce.refusal };
        const objects = removalOrder({ ...record, created: [...record.created] });
        const settings = objects.filter((o) => o.kind === STORE_CONFIG_KIND);
        const { take, kept } = await decideRemovals(commerce.get, objects.filter((o) => o.kind !== STORE_CONFIG_KIND));
        // A kept container by the name the store gives it; anything else by the pack's name for it.
        const keptNames = new Map(kept.map((k) => [k.object, k.name]));
        const named = (o: CreatedObject): string => keptNames.get(o) ?? o.key ?? o.id;
        const data: DatapackRecordsResult = {
            records: namesByKind([...settings, ...take], named),
            kept: namesByKind(keptObjects(kept), named),
        };
        return { success: true, data };
    } catch (error) {
        return failure(context, error, 'What the uninstall would take could not be read.');
    }
}
