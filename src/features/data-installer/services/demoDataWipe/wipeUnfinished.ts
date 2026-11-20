/**
 * What a clearing could not finish and no read would find again (owner, 2026-11-02: running again
 * picks up what is left). A catalog, group, set or attribute is looked at because the customers or
 * products going use it. Once they are gone, a delete Commerce refused leaves it tied to nothing, so
 * the next clearing would never see it. This note, beside the project, says which to look at again.
 *
 * It only widens what is LOOKED AT: each still has to pass every rule (`wipeCatalogs.ts`,
 * `wipeAttributes.ts`), and it counts only for the same stores. A note that cannot be read is ignored,
 * so what it named is reported nowhere: the store itself is unchanged.
 *
 * @module features/data-installer/services/demoDataWipe/wipeUnfinished
 */

import * as path from 'path';
import { z } from 'zod';
import type { RecordFiles } from '../demoBuilderEngine/installRecord';
import { parseJSON } from '@/types/typeGuards';

const unfinishedSchema = z.object({
    scopeKey: z.string(),
    groups: z.array(z.number()),
    sets: z.array(z.number()),
    attributes: z.array(z.string()),
});

export type WipeUnfinished = z.infer<typeof unfinishedSchema>;

const notePath = (projectPath: string): string => path.join(projectPath, '.demo-builder', 'wipe-unfinished.json');

/** The note left by the last clearing, if it left one and it can be read. */
export async function readWipeUnfinished(files: RecordFiles, projectPath: string): Promise<WipeUnfinished | undefined> {
    const text = await files.read(notePath(projectPath));
    if (text === undefined) return undefined;
    const parsed = unfinishedSchema.safeParse(parseJSON(text));
    return parsed.success ? parsed.data : undefined;
}

/** Leave the note, or take it away when the clearing finished. */
export async function rememberWipeUnfinished(files: RecordFiles, projectPath: string, unfinished: WipeUnfinished | undefined): Promise<void> {
    if (unfinished) await files.write(notePath(projectPath), `${JSON.stringify(unfinished, null, 2)}\n`);
    else await files.remove(notePath(projectPath));
}
