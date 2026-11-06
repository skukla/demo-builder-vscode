/**
 * Export handlers: capture a datapack FROM the project's Commerce store.
 *
 * Three message types, all Demo Builder's own (datapack-engine step 14): `list-datapack-export-items`
 * reads one kind of the project's store with the project's own credential (`listPickableItems`),
 * `count-datapack-export-items` says how many of each there are before any is listed, and
 * `start-datapack-export` saves what is picked into a new version of this demo's own pack in Demo
 * Builder's datapack store (`saveFromStore`), with the project's own pack when Demo Builder
 * installed it. Nothing reaches the Data Installer: a pack goes there by Copy to the Data Installer.
 *
 * The Data Installer service's own export, which captured a store into its shared catalog with the
 * service's Commerce access, was deleted on 2026-11-06 (DI-12): that access has ignored the
 * credentials a caller sends since 2026-10-27, and Save As then Copy does the same job.
 *
 * Merged into `importHandlers` so the panel and its tests keep one map to reach for; separate here
 * because the import spine was already at its size limit.
 *
 * @module features/data-installer/handlers/exportHandlers
 */

import type { Selections } from '../pickableKinds';
import { countPickableItems, listPickableItems, saveFromStore } from './storeChangesHandlers';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

/** Why an ACO export is refused while ACO packs are held back (owner, 2026-11-03). */
export const ACO_HELD_BACK = 'ACO datapacks arrive with ACO support, in a later release. Make a Commerce datapack instead.';

export const exportHandlers = defineHandlers({
    /** What the project's store holds of one data type, to pick from. */
    'list-datapack-export-items': (context: HandlerContext, payload?: ExportPayload): Promise<HandlerResponse> =>
        listPickableItems(context, payload),

    /** How many of each pickable kind the project's store has. */
    'count-datapack-export-items': (context: HandlerContext, payload?: ExportPayload): Promise<HandlerResponse> =>
        countPickableItems(context, payload),

    /** Save what is picked into a new version of the demo's own pack (Save, or Save As with `saveAs`). */
    'start-datapack-export': async (context: HandlerContext, payload?: ExportPayload): Promise<HandlerResponse> => {
        // ACO packs are held back until ACO support ships (owner, 2026-11-03): one saved now would
        // sit in the library with nothing to install it. The ACO line reverts this.
        if (payload?.aco === true) return { success: false, error: ACO_HELD_BACK, code: ErrorCode.INVALID_OPERATION };
        return saveFromStore(context, payload);
    },
});

/** Payload for the two export message types. */
export interface ExportPayload {
    datapackName?: string;
    version?: string;
    commerceInstance?: string;
    dataTypes?: string[];
    /** List call only: which type to enumerate. */
    dataType?: string;
    /** `{<type>: {<idField>: [ids]}}`: what is picked of each kind. */
    selections?: Selections;
    /** The save must be confirmed, as `save-store-changes-to-pack`'s is. */
    confirm?: boolean;
    /** Save As: a new datapack of the user's under this name. */
    saveAs?: { displayName?: string };
    /** Make an ACO pack from this store, into the library (`acoExportHandler.ts`). */
    aco?: boolean;
    /** ACO only: the store views to make it for; omitted means every one. */
    storeViews?: string[];
}
