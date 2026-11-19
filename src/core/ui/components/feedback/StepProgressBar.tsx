/**
 * StepProgressBar: where a multi-step job has got to, as the Prerequisites step first drew it: a
 * small bar labelled "Step 2/3: Installing Node.js 20", with what the step is doing after a dash
 * when it says. Moved to core from `PrerequisitesStep` on 2026-11-19, when the Updates run became
 * its second user (owner: "reuse absolutely everything we can from prerequisites").
 *
 * Styled by `step-progress.css`, which each bundle that draws it imports in its entry (`wizard`,
 * `projectsList`).
 *
 * @module core/ui/components/feedback/StepProgressBar
 */

import { ProgressBar, View } from '@adobe/react-spectrum';
import React from 'react';
import type { UnifiedProgress } from '@/types/webview';

/**
 * How full the bar is: the whole job's share when it has several steps, else the one command's
 * own percent when it knows it.
 */
export function getProgressValue(unifiedProgress: UnifiedProgress): number {
    if (unifiedProgress.overall.totalSteps > 1) {
        return unifiedProgress.overall.percent;
    }
    if (
        unifiedProgress.command?.type === 'determinate' &&
        unifiedProgress.command?.percent != null
    ) {
        return unifiedProgress.command.percent;
    }
    return unifiedProgress.overall.percent;
}

/**
 * "Step 2/3: Installing Node.js 20", then " - " and what it is doing, when it says and it is not
 * given its own line.
 */
export function stepProgressLabel(progress: UnifiedProgress, detailBelow = false): string {
    const { currentStep, totalSteps, stepName } = progress.overall;
    const detail = progress.command?.detail && !detailBelow ? ` - ${progress.command.detail}` : '';
    return `Step ${currentStep}/${totalSteps}: ${stepName}${detail}`;
}

interface StepProgressBarProps {
    progress: UnifiedProgress;
    /**
     * What the step is doing on a small line under the bar, not after a dash in its label: a
     * long one, such as which part of an integration is deploying (the Updates run, owner
     * 2026-11-19).
     */
    detailBelow?: boolean;
}

/** The labelled bar, faded in under the thing it is about. */
export function StepProgressBar({ progress, detailBelow = false }: StepProgressBarProps): React.ReactElement {
    const below = detailBelow ? progress.command?.detail : undefined;
    return (
        <View marginTop="size-100" UNSAFE_className="animate-fade-in">
            <ProgressBar
                label={stepProgressLabel(progress, detailBelow)}
                value={getProgressValue(progress)}
                maxValue={100}
                size="S"
                UNSAFE_className="progress-bar-spacing progress-bar-small-label progress-bar-full-width"
            />
            {below && <div className="step-progress-detail">{below}</div>}
        </View>
    );
}
