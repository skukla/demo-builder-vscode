/**
 * The Import dialog's result body, by the dialog design rules
 * (`docs/development/sop/dialog-design.md`, owner 2026-10-31): the outcome and its status are the
 * dialog's title (`viewFrame`), so this holds only what is left to know or do. A plain success
 * has nothing here at all. Otherwise: the sentence, the troubled types, the Admin step a removal
 * left (Where / Enter / Then, drawn as the setup guide draws a step), and how long a long job took.
 *
 * It was a status box over Store, Data and Took rows, which repeated what the SC had picked
 * seconds before and read as machine-made.
 *
 * @module features/data-installer/ui/components/ImportResultView
 */

import React from 'react';
import type { KeptRootStep } from '../../types';
import type { ResultContent } from './importResult';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { SetupStepFacts } from '@/core/ui/components/ui/SetupStepFacts';
import { tookValue } from '@/core/ui/hooks/useRunClock';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

/** The kept root's Admin step, as the setup step's item. */
function keptRootItem(step: KeptRootStep): SetupChecklistItem {
    return {
        id: 'kept-root',
        title: '',
        where: `Stores > All Stores > ${step.store}`,
        path: ['Stores', 'All Stores', step.store],
        enter: [`Root Category: ${step.restore ?? 'the one it had before the pack'}`],
        then: 'Save Store, then remove the pack again.',
        // The result's sentence already says why.
        why: '',
        state: 'open',
        checkable: false,
    };
}

export function ImportResultView({ result }: { result: ResultContent }): React.JSX.Element | null {
    const took = result.tookMs === undefined ? undefined : tookValue(result.tookMs);
    const hasBody = result.message || result.details?.length || result.keptRoot || took;
    if (!hasBody) return null;
    return (
        <div className="dialog-stack">
            {result.message ? <LeadText>{result.message}</LeadText> : null}
            {result.details?.map((line) => (
                <p key={line} className="dialog-line">
                    {line}
                </p>
            ))}
            {result.keptRoot ? <SetupStepFacts item={keptRootItem(result.keptRoot)} /> : null}
            {took !== undefined ? <p className="dialog-note">Took {took}</p> : null}
        </div>
    );
}
