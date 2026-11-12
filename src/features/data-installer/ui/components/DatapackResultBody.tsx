/**
 * A datapack dialog's result body (Import, Export and Load a datapack file), by the dialog design
 * rules (`docs/development/sop/dialog-design.md`, owner 2026-10-31): the outcome and its status are
 * the dialog's title, so this holds only what is left to know or do. A plain success has nothing
 * here at all. Otherwise: the sentence, the per-type lines, the Admin step a removal left (Where /
 * Set / Then, drawn as the setup guide draws a step), and how long a long job took: the house
 * ending under a run (`RunFoot`), here with no rows above it.
 *
 * It was a status box over Store, Data and Took rows, which repeated what the SC had picked
 * seconds before and read as machine-made.
 *
 * @module features/data-installer/ui/components/DatapackResultBody
 */

import React from 'react';
import type { KeptRootStep } from '../../types';
import type { ResultContent } from './importResult';
import { RunFoot } from '@/core/ui/components/feedback/RunFoot';
import { SetupStepFacts } from '@/core/ui/components/ui/SetupStepFacts';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

/** The kept root's Admin step, as the setup step's item. */
function keptRootItem(step: KeptRootStep): SetupChecklistItem {
    return {
        id: 'kept-root',
        title: '',
        where: `Stores > All Stores > ${step.store}`,
        path: ['Stores', 'All Stores', step.store],
        enter: [`Root Category: ${step.restore ?? 'the one it had before the datapack'}`],
        then: 'Save Store, then uninstall the datapack again.',
        // The result's sentence already says why.
        why: '',
        state: 'open',
        checkable: false,
    };
}

export function DatapackResultBody({ result }: { result: ResultContent }): React.JSX.Element | null {
    return (
        <RunFoot lead={result.message} lines={result.details} tookMs={result.tookMs}>
            {result.keptRoot ? <SetupStepFacts item={keptRootItem(result.keptRoot)} /> : null}
        </RunFoot>
    );
}
