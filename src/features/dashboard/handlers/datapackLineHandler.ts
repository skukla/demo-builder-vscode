/**
 * The dashboard's Datapacks card line (owner, 2026-11-07): the pack this demo holds, "Luma,
 * eds-compatible", or "No Datapack". The sidebar's Datapacks tile opens the Datapack Library, every
 * pack; this card opens this demo's Datapacks, and its line is what tells the two apart.
 *
 * A project records its pack by id ("luma"), so the name the SC knows is read from the library
 * (`libraryDisplayName`), never with a sign-in prompt: a card's line is not worth one. When the name
 * cannot be read (signed out, a Data Installer pack, a library that does not answer), the line says
 * whose data it is instead of showing an id.
 *
 * **A name read before is shown at once** (walk F69): the library read took long enough that the
 * card drew without a line and gained one a moment later. The remembered name answers now, and the
 * read still runs behind it, so a name changed elsewhere shows the next time the card draws.
 *
 * @module features/dashboard/handlers/datapackLineHandler
 */

import { libraryDisplayName } from '@/features/data-installer/handlers/libraryWriter';
import { packLine } from '@/features/data-installer/packVersions';
import { rememberedPackName } from '@/features/data-installer/services/packNames';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

export const NO_DATAPACK = 'No Datapack';
export const UNNAMED_DATAPACK = "This demo's data";

/** `get-datapack-line`: the Datapacks card's line for the open project. */
export async function handleGetDatapackLine(context: HandlerContext): Promise<HandlerResponse> {
    const project = await context.stateManager.getCurrentProject();
    const held = project?.datapack;
    if (!held) return { success: true, data: { line: NO_DATAPACK } };
    // No panel: the library guard then reports a missing sign-in instead of asking for one.
    const reading = libraryDisplayName({ ...context, panel: undefined }, held);
    const known = held.store === 'library'
        ? rememberedPackName(context.context.globalState, held.name)
        : undefined;
    const name = known ?? (await reading);
    return {
        success: true,
        data: { line: name ? packLine(name, held.version) : UNNAMED_DATAPACK },
    };
}
