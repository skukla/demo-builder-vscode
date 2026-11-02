/**
 * What the removal confirm shows and what its Remove sends (datapack-engine step 05), decided from
 * what the read found and the two boxes. Pure, as `importModalView` is; `useRemovalConfirm` holds
 * the state these decide from.
 *
 * @module features/data-installer/ui/components/removalConfirm
 */

import type { ChangesAnswer, DatapackRemovalChanges } from '../../removalChanges';
import type { DataInstallerFailure } from '../hooks/useDataInstallerRequest';

/** What the confirm holds below today's sentence. */
export type ConfirmContent =
    /** Nothing changed: the confirm as it always was. */
    | { kind: 'plain' }
    /** The SC's changes, and the two boxes. */
    | { kind: 'changes'; sentence: string; packName: string }
    /** The setting answers: the one line, and no boxes. */
    | { kind: 'will-save'; packName: string }
    /** The read failed, so nothing is known; never the same as nothing changed. */
    | { kind: 'read-failed'; reason: string };

/** The two boxes. */
export interface RemovalChoice {
    saveFirst: boolean;
    always: boolean;
}

/** Keeping the work is the likely intent; stopping the question is a choice of its own. */
export const FRESH_CHOICE: RemovalChoice = { saveFirst: true, always: false };

/** What the Remove press adds to the request. */
export interface RemovalAnswer {
    changes: ChangesAnswer;
    /** Turn on "always save": only ever said by this confirm's box, never by an agent. */
    alwaysSave?: true;
}

/** What the confirm shows, from the read's answer or its failure. */
export function confirmContent(answer: DatapackRemovalChanges | null, failure: DataInstallerFailure | null): ConfirmContent {
    // No answer at all has only transport text to show, which is not words for the SC.
    if (failure) return { kind: 'read-failed', reason: failure.unanswered ? 'The check took too long to answer.' : failure.message };
    if (!answer || answer.count === 0 || answer.sentence === undefined) return { kind: 'plain' };
    if (answer.alwaysSave) return { kind: 'will-save', packName: answer.ownPackName };
    return { kind: 'changes', sentence: answer.sentence, packName: answer.ownPackName };
}

/** Unticking the save takes "always" with it: it cannot always do what it is not doing. */
export function toggleSave(choice: RemovalChoice): RemovalChoice {
    return choice.saveFirst ? { saveFirst: false, always: false } : { saveFirst: true, always: false };
}

export function toggleAlways(choice: RemovalChoice): RemovalChoice {
    return { ...choice, always: !choice.always };
}

/** What Remove sends. With nothing to keep, or nothing known, there is nothing to save. */
export function removalAnswer(content: ConfirmContent, choice: RemovalChoice): RemovalAnswer {
    if (content.kind === 'will-save') return { changes: 'keep' };
    if (content.kind !== 'changes' || !choice.saveFirst) return { changes: 'drop' };
    return choice.always ? { changes: 'keep', alwaysSave: true } : { changes: 'keep' };
}

/** The confirm's main button. */
export function removeLabel(content: ConfirmContent): string {
    return content.kind === 'read-failed' ? 'Remove anyway' : 'Remove';
}
