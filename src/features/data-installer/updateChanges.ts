/**
 * What an update writes, by data type (step-07 U1, J9-2): the preview of the newer version against
 * the version installed's record (`previewChanges` with `recordOf`), as the check answers it. One row
 * per data type the newer version changed, counted by what the update writes (added, updated,
 * removed), with every record it writes and every record the SC edited since, which it leaves as they
 * are. A type with nothing to write is not listed (prototype-conventions rule 7), and a kind that
 * installs with another (an attribute's options) counts on that type, as `installRows` counts it.
 *
 * Pure: the handler, the agent tool and the window read the same rows.
 *
 * @module features/data-installer/updateChanges
 */

import type { ChangePreview } from './services/demoBuilderEngine/storeChanges';
import type { UpdateTypeChange } from '@/types/webviewRequests';

/** The rows, in the order the preview names the kinds. */
export function updateChanges(preview: ChangePreview): UpdateTypeChange[] {
    const rows = new Map<string, UpdateTypeChange>();
    for (const kind of preview.kinds) {
        const type = kind.installsWith ?? kind.kind;
        const row = rows.get(type) ?? {
            type,
            added: 0,
            updated: 0,
            removed: 0,
            changed: [],
            kept: [],
        };
        rows.set(type, {
            type,
            added: row.added + kind.add.count,
            updated: row.updated + kind.update.count,
            removed: row.removed + kind.remove.count,
            changed: [
                ...row.changed,
                ...kind.add.names,
                ...kind.update.names,
                ...kind.remove.names,
            ],
            kept: [...row.kept, ...kind.keep.names],
        });
    }
    return [...rows.values()].filter((row) => row.added + row.updated + row.removed > 0);
}

/** "3 updated", "12 added, 36 updated": what a type's row says it writes (rule 5, bare verbs). */
export function updateHappens(
    row: Pick<UpdateTypeChange, 'added' | 'updated' | 'removed'>,
): string {
    const parts: Array<[number, string]> = [
        [row.added, 'added'],
        [row.updated, 'updated'],
        [row.removed, 'removed'],
    ];
    return parts
        .filter(([count]) => count > 0)
        .map(([count, word]) => `${count.toLocaleString('en-US')} ${word}`)
        .join(', ');
}
