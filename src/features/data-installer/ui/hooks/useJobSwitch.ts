/**
 * What a switch or an uninstall adds to a datapack job (step 03, S6 and S7): the press, the save
 * question's answers, the save's stage and where the save went. Split out of `useDatapackJob`.
 *
 * @module features/data-installer/ui/hooks/useJobSwitch
 */

import type { Dispatch } from 'react';
import { replacedName } from '../../replaceWords';
import type { JobEvent } from '../components/job/datapackJob';
import type { JobReadsArgs, useJobReads } from './useJobReads';
import type { useJobStart } from './useJobStart';
import { type SwitchChanges, useSavingStage } from './useSwitchChanges';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

/** A switch's or an uninstall's part of the job: the SC's changes and the save question's answers. */
export interface JobSwitch {
    changes: SwitchChanges;
    /** The held datapack, as a switch's run's Uninstall row names it. */
    heldName?: string;
    /** The save's stage while the start waits on it. */
    savingStage?: string;
    /** Where the save made first went, once the SC chose to save: the run's Save Your Changes says it. */
    savedTo?: string;
    /** Switch or Uninstall pressed: the save question, or the run. */
    press: () => void;
    /** The save question answered. */
    answer: (saves: boolean) => void;
}

/** The message asking for the one-time tip about the setting (webview only; agents never send it). */
const SAVE_QUESTION_ANSWERED = 'datapack-save-question-answered';

/** Where a save made first goes: into the SC's own datapack, or the new one by the name given. */
function savedToOf(
    starts: ReturnType<typeof useJobStart>,
    changes: SwitchChanges,
    name: string | undefined,
) {
    if (!starts.savesFirst) return undefined;
    return changes.saveAs?.name.trim() ?? name;
}

/** What a switch or an uninstall adds: the press, the save question's answers, the save's stage. */
export function useJobSwitch(
    args: JobReadsArgs,
    checks: ReturnType<typeof useJobReads>,
    starts: ReturnType<typeof useJobStart>,
    dispatch: Dispatch<JobEvent>,
): JobSwitch {
    const { changes } = checks;
    const savingStage = useSavingStage(starts.savesFirst && starts.start.loading);
    const held = checks.target.value?.datapack;
    // As the run's Uninstall row names it: "Luma", or "Luma, eds-compatible" for a named version.
    const heldName = held
        ? replacedName(held, checks.target.value?.heldName ?? held.name)
        : undefined;
    const savedTo = savedToOf(
        starts,
        changes,
        args.kind === 'uninstall' ? args.displayName : heldName,
    );
    return {
        changes,
        ...(heldName ? { heldName } : {}),
        ...(savingStage ? { savingStage } : {}),
        ...(savedTo ? { savedTo } : {}),
        press: () => {
            const next = changes.onSwitch();
            if (next === 'ask') dispatch({ type: 'save-first' });
            else starts.startWith(next);
        },
        answer: (saves) => {
            webviewClient.postMessage(SAVE_QUESTION_ANSWERED);
            starts.startWith(changes.answer(saves));
        },
    };
}
