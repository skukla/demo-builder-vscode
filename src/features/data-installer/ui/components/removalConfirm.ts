/**
 * What the removal confirm shows and what its Remove sends (datapack-engine step 05), decided from
 * what the read found and the two boxes. Pure, as `importModalView` is; `useRemovalConfirm` holds
 * the state these decide from.
 *
 * @module features/data-installer/ui/components/removalConfirm
 */

import type { ChangedKind, ChangesAnswer, DatapackRemovalChanges } from '../../removalChanges';
import { STORE_CONFIG_KIND } from '../../services/datapackCatalog';
import type { DataInstallerFailure } from '../hooks/useDataInstallerRequest';

/** What the confirm holds below today's sentence. */
export type ConfirmContent =
    /** Nothing changed: the confirm as it always was. */
    | { kind: 'plain' }
    /**
     * The SC's changes: saved into the demo's pack when it is theirs (`packName`), else as a new
     * pack under a name they give (`suggestedName` is where the name starts).
     */
    | { kind: 'changes'; sentence: string; packName?: string; kinds?: ChangedKind[] }
    /** The setting answers: the one line, and no boxes. */
    | { kind: 'will-save'; packName: string }
    /** The read failed, so nothing is known; never the same as nothing changed. */
    | { kind: 'read-failed'; reason: string };

/**
 * What the confirm says goes, when Demo Builder's engine installed the pack: what its install record
 * lists, not what is ticked (the service removes what is ticked, and its sentence is the modal's).
 * Store configuration is not deleted, it is put back, so it gets a sentence of its own. The ticks
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
        kinds.length < recordedKinds.length ? `Puts back the store configuration ${kinds.length > 0 ? 'it' : displayName} changed.` : undefined,
        recordedKinds.length === 0 ? `${displayName} has nothing left in Commerce to delete.` : undefined,
        selected.length > 0 && recordedKinds.some((kind) => !selected.includes(kind)) ? 'The data types you tick apply to Install only.' : undefined,
    ];
    return sentences.filter((line): line is string => line !== undefined);
}

/** The confirm's one box, and the name a save as a new pack goes under. */
export interface RemovalChoice {
    always: boolean;
    /** Save As's name, when the demo's pack is not the SC's; starts as `suggestedName`. */
    saveAsName?: string;
}

/** Stopping the question is a choice of its own. */
export const FRESH_CHOICE: RemovalChoice = { always: false };

/** What a press of one of the confirm's buttons adds to the request. */
export interface RemovalAnswer {
    changes: ChangesAnswer;
    /** Turn on "always save": only ever said by this confirm's box, never by an agent. */
    alwaysSave?: true;
    /** The name of the new datapack the changes go into, when the demo's pack is not the SC's. */
    saveAs?: { displayName: string };
}

/** What the confirm shows, from the read's answer or its failure. */
export function confirmContent(answer: DatapackRemovalChanges | null, failure: DataInstallerFailure | null): ConfirmContent {
    // No answer at all has only transport text to show, which is not words for the SC.
    if (failure) return { kind: 'read-failed', reason: failure.unanswered ? 'The check timed out.' : failure.message };
    if (!answer || answer.count === 0 || answer.sentence === undefined) return { kind: 'plain' };
    // "Always save" needs somewhere to save without asking: only the SC's own pack is that.
    if (answer.alwaysSave && answer.packName) return { kind: 'will-save', packName: answer.packName };
    return {
        kind: 'changes',
        sentence: answer.sentence,
        // Each data type and what changed in it, for the confirm's list (walk F110).
        ...(answer.kinds.length > 0 ? { kinds: answer.kinds } : {}),
        ...(answer.packName ? { packName: answer.packName } : {}),
    };
}

export function toggleAlways(choice: RemovalChoice): RemovalChoice {
    return { ...choice, always: !choice.always };
}

/** The name Save As would use: what the SC typed. It starts empty, as Create Datapack's does. */
export function saveAsNameOf(content: ConfirmContent, choice: RemovalChoice): string {
    if (content.kind !== 'changes') return '';
    return (choice.saveAsName ?? '').trim();
}

/**
 * What a press sends. `save` keeps the changes (into the SC's pack, or as a new one by the name
 * given); `drop` loses them. With nothing to keep, or nothing known, there is nothing to save.
 */
export function removalAnswer(content: ConfirmContent, choice: RemovalChoice, save: boolean): RemovalAnswer {
    if (content.kind === 'will-save') return { changes: 'keep' };
    if (content.kind !== 'changes' || !save) return { changes: 'drop' };
    const always = choice.always && content.packName ? { alwaysSave: true as const } : {};
    if (content.packName) return { changes: 'keep', ...always };
    return { changes: 'keep', saveAs: { displayName: saveAsNameOf(content, choice) } };
}

/**
 * The confirm's main button when there are no changes to keep: it names what pressing it does. With
 * changes the buttons are the save-first pair (`buildActions`, `datapackWords.ts`).
 */
export function removeLabel(content: ConfirmContent): string {
    return content.kind === 'read-failed' ? 'Uninstall Anyway' : 'Uninstall';
}
