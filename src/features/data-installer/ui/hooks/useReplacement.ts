/**
 * An import over the pack the demo uses (walk F97, owner 2026-11-09): the form says what it
 * replaces, and Import first reads what the SC changed in that pack, the way the Datapacks removal
 * does. With changes (or a read that failed) the removal's own confirm asks, titled "Save Your
 * Changes First?" (walk F106); with none, the import starts at once. Either way the answer rides on the import's request, and the
 * extension removes the old pack and installs the new one as one job.
 *
 * Reuses `useRemovalConfirm` rather than a second confirm: the read, the boxes, the Save As name and
 * the buttons are the removal's, so the two cannot ask differently.
 *
 * @module features/data-installer/ui/hooks/useReplacement
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { versionLabel } from '../../packVersions';
import { replacedName, replacesHeld, replacesSentence } from '../../replaceWords';
import type { ConfirmContent, RemovalAnswer } from '../components/removalConfirm';
import type { RemovalConfirm } from './useRemovalConfirm';
import type { DatapackId, ProjectDatapack } from '@/types/datapack';

/** What the project holds, as `get-datapack-import-target` answers it. */
export interface HeldPack {
    datapack?: ProjectDatapack;
    /** When Demo Builder's engine installed it: only then is there a record to remove it by. */
    installedAt?: string;
    /** Its name as the SC knows it. */
    heldName?: string;
}

export interface Replacement {
    /** The pack replaced, as the SC knows it; absent when nothing is. */
    name?: string;
    /** The pack replaced is another version of the same pack: that version, "Nov 9, 9:15 AM". */
    version?: string;
    /** The form's sentence. */
    sentence?: string;
    /** The confirm up (or its read out) is this import's, not a removal's. */
    forImport: boolean;
    /**
     * Saving first's stage while the import waits on it. "Starting" from the moment the save is
     * chosen, so the window draws Save Your Changes from the first frame, before the save's own
     * stages come (owner, 2026-11-09, walk F129: it appeared 15 seconds in and the window grew).
     */
    savingStage?: string;
    /** Import pressed: read the changes, then ask or start. */
    begin: () => void;
    /** The confirm answered: start the import with the answer. */
    answered: (answer: RemovalAnswer) => void;
    /** Cancel: back to the form, nothing changed. */
    disarm: () => void;
    /** Back from a save that failed: the same confirm, the import's when the import's save failed. */
    reopen: (forImport: boolean) => void;
    /** What the result needs to draw a failed save on the rows: the Removing row's name, the types asked for. */
    resultSource: (dataTypes: string[]) => { replacing?: { name: string; dataTypes: string[] } };
    /** What the dialog's frame needs: the pack the confirm up is about, when it is the import's. */
    frame: { replacing?: string };
}

/** Whether importing `importing` replaces the pack the project holds (walk F97). */
export function replacesHeldPack(importing: DatapackId, held: HeldPack | null | undefined): boolean {
    return replacesHeld(held?.datapack, importing, held?.installedAt !== undefined);
}

function savingStageOf(stage: string | undefined, savesFirst: boolean): { savingStage?: string } {
    if (stage) return { savingStage: stage };
    return savesFirst ? { savingStage: 'Starting' } : {};
}

/** The confirm's kinds under which keeping the changes runs a save. */
const SAVES = new Set(['changes', 'will-save']);

/** Only changes to keep, or a read that failed, need the SC: "always save" and nothing changed do not. */
const asks = (kind: ConfirmContent['kind']): boolean =>
    kind === 'changes' || kind === 'read-failed';

/**
 * @param importing - the pack the dialog imports
 * @param importingName - its name as the SC knows it
 * @param held - what the project holds
 * @param removal - the removal confirm, shared with Remove All Data
 * @param startWith - starts the import, with the answer about the SC's changes
 */
export function useReplacement(
    importing: DatapackId,
    importingName: string,
    held: HeldPack | null | undefined,
    removal: RemovalConfirm,
    startWith: (answer?: RemovalAnswer) => void,
): Replacement {
    const [stage, setStage] = useState<'idle' | 'reading' | 'asking'>('idle');
    const [savesFirst, setSavesFirst] = useState(false);
    const pack = held?.datapack;
    const replaces = replacesHeldPack(importing, held) ? pack : undefined;
    const heldName = held?.heldName ?? replaces?.name ?? '';

    // The latest press and start, for the effect that runs once the read answers.
    const latest = useRef({ removal, startWith });
    latest.current = { removal, startWith };

    const answered = useCallback((answer: RemovalAnswer): void => {
        // A save runs when there are changes to keep, asked or saved without asking; nothing changed
        // saves nothing, whatever the answer says.
        setSavesFirst(answer.changes === 'keep' && SAVES.has(latest.current.removal.content.kind));
        setStage('idle');
        latest.current.startWith(answer);
    }, []);

    // Keyed on the content's kind: the content itself is a new object each render.
    const armed = removal.armed;
    const kind = removal.content.kind;
    useEffect(() => {
        if (stage !== 'reading' || !armed) return;
        if (asks(kind)) {
            setStage('asking');
            return;
        }
        answered(latest.current.removal.press(true));
    }, [stage, armed, kind, answered]);

    const arm = removal.arm;
    const begin = useCallback((): void => {
        if (!replaces) {
            latest.current.startWith();
            return;
        }
        setStage('reading');
        arm({
            datapackName: replaces.name,
            version: replaces.version,
            ...(replaces.store === 'library' ? { source: 'library' } : {}),
        });
    }, [replaces, arm]);

    const { disarm, reopen } = removal;
    const name = replaces ? replacedName(replaces, importing, heldName) : undefined;
    return {
        ...(replaces && name ? { name, sentence: replacesSentence(replaces, importing, { held: heldName, importing: importingName }) } : {}),
        ...(replaces && replaces.name === importing.name ? { version: versionLabel(replaces.version) } : {}),
        forImport: stage !== 'idle',
        ...savingStageOf(removal.stage, savesFirst),
        begin,
        answered,
        disarm: useCallback(() => {
            setStage('idle');
            disarm();
        }, [disarm]),
        reopen: useCallback(
            (forImport: boolean) => {
                if (forImport) setStage('asking');
                reopen();
            },
            [reopen],
        ),
        resultSource: (dataTypes) => (name ? { replacing: { name, dataTypes } } : {}),
        frame: stage !== 'idle' && name ? { replacing: name } : {},
    };
}
