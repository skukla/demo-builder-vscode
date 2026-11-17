/**
 * A datapack window's result (Import, Export and Load a datapack file) in the shared result body's
 * terms (`ResultBody`; owner, 2026-11-17, walk F222): the datapack as the title, the outcome under the
 * large mark, the sentence and the per-type lines under it, how long a long job took, and the Admin
 * step a removal left (Where / Set / Then, drawn as the setup guide draws a step).
 *
 * It was a status box over Store, Data and Took rows, which repeated what the SC had picked seconds
 * before and read as machine-made; then the outcome in the title with a small icon.
 *
 * @module features/data-installer/ui/components/datapackResultWords
 */

import React from 'react';
import type { KeptRootStep } from '../../types';
import { type ResultContent, resultStatus } from './importResult';
import type { ModalStatus } from '@/core/ui/components/ui/Modal';
import { SetupStepFacts } from '@/core/ui/components/ui/SetupStepFacts';
import { resultOutcome } from '@/core/ui/utils/resultWords';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

/** The kind a result names when it has no datapack's name. */
export const DATAPACKS_KIND = 'Datapacks';

/** A result as a result window takes it. */
export interface DatapackResultWords {
    title: string;
    outcome: string;
    status?: ModalStatus;
    lines: string[];
    tookMs?: number;
}

/**
 * The window's words for a result: the thing as the title, what happened for under the mark, the
 * sentence and the lines left to read, and how long it took.
 *
 * @param result - the outcome
 * @param kind - the title when the result names no datapack
 * @returns the result window's words
 */
export function datapackResultWords(result: ResultContent, kind: string = DATAPACKS_KIND): DatapackResultWords {
    const status = resultStatus(result);
    return {
        title: result.thing ?? kind,
        outcome: resultOutcome(result.title, result.thing),
        ...(status ? { status } : {}),
        lines: [...(result.message ? [result.message] : []), ...(result.details ?? [])],
        ...(result.tookMs === undefined ? {} : { tookMs: result.tookMs }),
    };
}

/** The kept root's Admin step, as the setup step's item. */
function keptRootItem(step: KeptRootStep): SetupChecklistItem {
    return {
        id: 'kept-root',
        title: '',
        where: `Stores > All Stores > ${step.store}`,
        path: ['Stores', 'All Stores', step.store],
        // The value alone in the pill (owner walk, 2026-11-16: "…, its root before the datapack" ran off the
        // window's edge); Check is how the uninstall goes on from this window (walk F153).
        enter: [step.restore ? `Root Category: ${step.restore}` : 'Root Category: the one it had before the datapack'],
        then: 'Save Store, then click Check.',
        // The result's sentence already says why.
        why: '',
        state: 'open',
        checkable: false,
    };
}

/** The Admin step a removal left for the SC, or nothing. */
export function KeptRootFacts({ result }: { result: ResultContent }): React.JSX.Element | null {
    return result.keptRoot ? <SetupStepFacts item={keptRootItem(result.keptRoot)} /> : null;
}
