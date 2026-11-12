/**
 * A Dry Run's answer, its own small window (step 03, S4; decisions Phase 4, J2-4; rules 12, 14):
 * "Dry Run Passed" with Back and Install; "Dry Run Failed" with Back and Retry; "Dry Run Found a
 * Problem" with Back alone until Fix with AI arrives (S5). Its one sentence is the result's: the
 * pass says nothing was written, a problem is the service's own reason.
 *
 * @module features/data-installer/ui/components/job/DryRunWindow
 */

import React from 'react';
import { INSTALL } from '../../../datapackWords';
import { type ResultContent, resultStatus } from '../importResult';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import type { ActionButton } from '@/core/ui/components/ui/Modal';
import { ResultWindow } from '@/core/ui/components/ui/ResultDialog';

export interface DryRunWindowProps {
    result: ResultContent;
    onBack: () => void;
    onInstall: () => void;
    onRetry: () => void;
    onClose: () => void;
}

/** The answer's main button: Install on a pass, Retry on a failure, none on a problem. */
function mainButton(
    result: ResultContent,
    onInstall: () => void,
    onRetry: () => void,
): ActionButton[] {
    if (result.variant === 'success')
        return [{ label: INSTALL, variant: 'accent', onPress: onInstall }];
    if (result.variant === 'error')
        return [{ label: 'Retry', variant: 'accent', onPress: onRetry }];
    return [];
}

export function DryRunWindow({
    result,
    onBack,
    onInstall,
    onRetry,
    onClose,
}: DryRunWindowProps): React.ReactElement {
    return (
        <ResultWindow
            title={result.title}
            status={resultStatus(result)}
            actionButtons={[
                { label: 'Back', variant: 'secondary', onPress: onBack },
                ...mainButton(result, onInstall, onRetry),
            ]}
            onClose={onClose}
        >
            {result.message ? <LeadText sentences>{result.message}</LeadText> : null}
        </ResultWindow>
    );
}
