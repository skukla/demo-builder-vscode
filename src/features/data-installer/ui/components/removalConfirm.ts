/**
 * What the removal confirm shows and what its Remove sends (datapack-engine step 05), decided from
 * what the read found and the two boxes. Pure, as `importModalView` is; `useRemovalConfirm` holds
 * the state these decide from.
 *
 * @module features/data-installer/ui/components/removalConfirm
 */

import type { ChangesAnswer, DatapackRemovalChanges } from '../../removalChanges';
import { STORE_CONFIG_KIND } from '../../services/datapackCatalog';
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

/**
 * What the confirm says goes, when Demo Builder's engine installed the pack: what its install record
 * lists, not what is ticked (the service removes what is ticked, and its sentence is the modal's).
 * Store settings are not deleted, they are put back, so they get a sentence of their own. The ticks
 * are mentioned only when they name less than what goes, where they could be read as a limit.
 *
 * @param recordedKinds - the kinds on the record, in install order
 * @param selected - what is ticked on the form
 * @param typesInWords - the record's other kinds, as the dialog design rules put them in a sentence
 */
export function recordedRemovalLines(displayName: string, recordedKinds: readonly string[], selected: readonly string[], typesInWords: (kinds: string[]) => string): string[] {
    const kinds = recordedKinds.filter((kind) => kind !== STORE_CONFIG_KIND);
    const sentences = [
        kinds.length > 0 ? `Permanently deletes what ${displayName} installed: ${typesInWords(kinds)}.` : undefined,
        kinds.length < recordedKinds.length ? `Puts back the store settings ${kinds.length > 0 ? 'it' : displayName} changed.` : undefined,
        recordedKinds.length === 0 ? `${displayName} has nothing left in the store to delete.` : undefined,
        selected.length > 0 && recordedKinds.some((kind) => !selected.includes(kind)) ? 'The ticked boxes only choose what Import installs.' : undefined,
    ];
    return sentences.filter((line): line is string => line !== undefined);
}

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
