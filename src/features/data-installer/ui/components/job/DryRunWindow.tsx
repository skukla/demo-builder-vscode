/**
 * A Dry Run's answer, its own small window (step 03, S4; decisions Phase 4, J2-4; rules 12, 14):
 * "Dry Run Passed" with Back and Install; "Dry Run Failed" with Back and Retry; "Dry Run Found a
 * Problem" with Back and Fix with AI (S5), the install's ending buttons. Fix with AI asks the
 * extension for the dry run it recorded, so the prompt never carries the window's text. Its one
 * sentence is the result's: the pass says nothing was written, a problem is the service's own reason.
 *
 * @module features/data-installer/ui/components/job/DryRunWindow
 */

import React from 'react';
import { FIX_WITH_AI, FIX_WITH_AI_HINT, INSTALL } from '../../../datapackWords';
import { type ResultContent, resultStatus } from '../importResult';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import type { ActionButton } from '@/core/ui/components/ui/Modal';
import { ResultWindow } from '@/core/ui/components/ui/ResultDialog';

export interface DryRunWindowProps {
    result: ResultContent;
    onBack: () => void;
    onInstall: () => void;
    onRetry: () => void;
    /** Fix with AI on a problem: opens the SC's AI on the recorded dry run. */
    onFix: () => void;
    onClose: () => void;
}

type MainActions = Pick<DryRunWindowProps, 'onInstall' | 'onRetry' | 'onFix'>;

/** The answer's main button, last: Install on a pass, Retry on a failure, Fix with AI on a problem. */
function mainButton(result: ResultContent, { onInstall, onRetry, onFix }: MainActions): ActionButton[] {
    if (result.variant === 'success')
        return [{ label: INSTALL, variant: 'accent', onPress: onInstall }];
    if (result.variant === 'error')
        return [{ label: 'Retry', variant: 'accent', onPress: onRetry }];
    return [{ label: FIX_WITH_AI, variant: 'accent', onPress: onFix, hint: FIX_WITH_AI_HINT }];
}

export function DryRunWindow({
    result,
    onBack,
    onInstall,
    onRetry,
    onFix,
    onClose,
}: DryRunWindowProps): React.ReactElement {
    return (
        <ResultWindow
            title={result.title}
            status={resultStatus(result)}
            actionButtons={[
                { label: 'Back', variant: 'secondary', onPress: onBack },
                ...mainButton(result, { onInstall, onRetry, onFix }),
            ]}
            onClose={onClose}
        >
            {result.message ? <LeadText sentences>{result.message}</LeadText> : null}
        </ResultWindow>
    );
}
