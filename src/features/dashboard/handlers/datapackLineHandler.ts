/**
 * The dashboard's Datapacks card line (owner, 2026-11-07): the pack this demo holds, "Luma,
 * eds-compatible" (the version only when it has two or more, step-07 P4), or "None" (step-04 S9). The sidebar's Datapacks tile opens the Datapack Library, every
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
 * **A failed install is said beside the name, never in it** (step-04 J6-4): `failed: true` when the
 * project's failure record names its datapack (`installFailedOf`, S7's rule). The card turns it into
 * the error dot with "Install failed" on hover; the line stays the bare name, with no reason.
 *
 * **A newer version waiting goes up to the tile** (walk F218): `newer: true` when the card would wear
 * its amber dot, by the card's rule (`updateWaiting`): a newer save remembered than the one held, or
 * data types an update left behind, and only with Demo Builder's install record. The newest save is
 * remembered by every list, the read behind this line and each save, so no read waits for it here,
 * except the first time, when nothing is remembered for the pack yet.
 *
 * @module features/dashboard/handlers/datapackLineHandler
 */

import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { libraryDisplayName } from '@/features/data-installer/handlers/libraryWriter';
import { isNewerSave, isSavedVersion, packLine } from '@/features/data-installer/packVersions';
import { installStateOf } from '@/features/data-installer/services/demoBuilderEngine/installState';
import { installFailedOf } from '@/features/data-installer/services/installFailure';
import { rememberedNewestSave, rememberedPackChoices, rememberedPackName } from '@/features/data-installer/services/packNames';
import type { Project } from '@/types/base';
import type { DatapackLine } from '@/types/datapack';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

export const NO_DATAPACK = 'None';
export const UNNAMED_DATAPACK = "This demo's data";

/**
 * The pack's name, and its version only when it offers two or more (step-07 P4, S9). How many it
 * offers is remembered by the same library read that remembers the name (`libraryDisplayName`), so
 * no second read: a count never read leaves the version out until the read behind the line lands.
 */
function lineOf(name: string, held: NonNullable<Project['datapack']>, context: HandlerContext): string {
    const offered = rememberedPackChoices(context.context.globalState, held.name) ?? 0;
    return offered >= 2 ? packLine(name, held.version) : name;
}

/** `get-datapack-line`: the Datapacks card's line for the open project. */
export async function handleGetDatapackLine(context: HandlerContext): Promise<HandlerResponse> {
    const project = await context.stateManager.getCurrentProject();
    const held = project?.datapack;
    if (!held) return { success: true, data: { line: NO_DATAPACK } satisfies DatapackLine };
    // No panel: the library guard then reports a missing sign-in instead of asking for one.
    const reading = libraryDisplayName({ ...context, panel: undefined }, held);
    const known = held.store === 'library'
        ? rememberedPackName(context.context.globalState, held.name)
        : undefined;
    const name = known ?? (await reading);
    const line = name ? lineOf(name, held, context) : UNNAMED_DATAPACK;
    await firstNewestRead(context, held, reading);
    const newer = await newerWaiting(context, project, held);
    const data: DatapackLine = { line, ...(installFailedOf(project) ? { failed: true } : {}), ...(newer ? { newer: true } : {}) };
    return { success: true, data };
}

/**
 * A datapack of saves with no newest save remembered yet (the first draw since this memory began, or
 * since it was installed): the read already running remembers it, so wait for that once, a few
 * seconds at most, since the line must not wait on a slow library (F69; live walk F218).
 */
async function firstNewestRead(context: HandlerContext, held: NonNullable<Project['datapack']>, reading: Promise<unknown>): Promise<void> {
    if (held.store !== 'library' || !isSavedVersion(held.version)) return;
    if (rememberedNewestSave(context.context.globalState, held.name) !== undefined) return;
    await Promise.race([reading, sleep(TIMEOUTS.DATAPACK_LINE_NEWEST_WAIT)]);
}

/** The card's amber dot, by its rule: a newer save or types left behind, with Demo Builder's record. */
async function newerWaiting(context: HandlerContext, project: Project, held: NonNullable<Project['datapack']>): Promise<boolean> {
    const { installedAt, updateBehind } = await installStateOf(project.path, held);
    if (installedAt === undefined) return false;
    const newest = rememberedNewestSave(context.context.globalState, held.name);
    return updateBehind === true || (newest !== undefined && isNewerSave(held, newest));
}
