/**
 * The one rule for "is this still as we left it?" (datapack-engine step 04).
 *
 * Demo Builder writes things that people then edit: AI-bundle files in a project (ADR-013,
 * `generatedFileWriter.ts`), DA.live pages (`ownedPages.ts`, `categoryTemplate.ts`), and next
 * Commerce objects from a datapack. Each records a fingerprint (`sha256.ts`) of what it wrote, and
 * before touching the thing again asks this rule what may happen to it. A thing whose fingerprint
 * moved since the record is someone else's now; a thing with no record cannot be proved ours.
 *
 * The rule only answers. Each caller keeps its own read and write, and decides what an answer
 * means for it: ADR-013 overwrites an unrecorded file once (`leave-not-ours` on a write), a
 * DA.live template is never rewritten once it exists (`update` keeps it).
 *
 * | Now there | Record           | Wanted    | Answer           |
 * |-----------|------------------|-----------|------------------|
 * | nothing   | any              | something | `create`         |
 * | nothing   | any              | nothing   | `gone`           |
 * | something | none             | any       | `leave-not-ours` |
 * | something | differs from now | any       | `leave-edited`   |
 * | something | matches now      | nothing   | `remove`         |
 * | something | matches now      | the same  | `unchanged`      |
 * | something | matches now      | different | `update`         |
 *
 * A thing that was written and has since been deleted counts as "nothing": it is created again
 * when wanted. A caller that treats a deletion as an edit checks `recorded` itself.
 *
 * @module core/utils/ownedChange
 */

/** Three fingerprints of one thing; equal strings mean the same content. */
export interface OwnedState {
    /** Recorded when Demo Builder last wrote it; undefined when there is no record. */
    recorded: string | undefined;
    /** What is there now; undefined when nothing is. */
    current: string | undefined;
    /** What Demo Builder wants there; undefined when it wants it gone. */
    wanted: string | undefined;
}

/** What may happen to the thing (the table above). */
export type OwnedChange =
    | 'create'
    | 'update'
    | 'unchanged'
    | 'remove'
    | 'gone'
    | 'leave-edited'
    | 'leave-not-ours';

/**
 * Decide what may happen to one thing Demo Builder may have written.
 *
 * @param state - what was recorded, what is there now, and what is wanted
 * @returns the answer from the table in the module comment
 */
export function decideOwnedChange({ recorded, current, wanted }: OwnedState): OwnedChange {
    if (current === undefined) return wanted === undefined ? 'gone' : 'create';
    if (recorded === undefined) return 'leave-not-ours';
    if (current !== recorded) return 'leave-edited';
    if (wanted === undefined) return 'remove';
    return wanted === current ? 'unchanged' : 'update';
}
