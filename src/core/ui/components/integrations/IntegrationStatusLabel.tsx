/**
 * IntegrationStatusLabel — an integration's status as every surface shows it: a 6px
 * dot and the 11px uppercase label, red when the status is an error.
 *
 * Three surfaces read it — the card, its flyout, and the progress modal (PL-59). The
 * card and flyout carried their own copies of this markup; a third copy is where two
 * of them start to disagree, so it lives here and the wrapper stays with each caller.
 *
 * @module core/ui/components/integrations/IntegrationStatusLabel
 */

import React from 'react';
import type { IntegrationCardModel } from './integrationCardModel.types';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import { cn } from '@/core/ui/utils/classNames';

export interface IntegrationStatusLabelProps {
    model: Pick<IntegrationCardModel, 'dotVariant' | 'status' | 'statusLabel'>;
}

/** The dot and label; the caller supplies the line that holds them. */
export function IntegrationStatusLabel({ model }: IntegrationStatusLabelProps): React.ReactElement {
    return (
        <>
            {/* size 6 matches the project card's status dot — the 8px default sat
                heavier beside the same 11px uppercase label. No pulse class:
                `deploying` maps to the `info` variant, and StatusDot pulses on info
                by itself. */}
            <StatusDot variant={model.dotVariant} size={6} />
            <span
                className={cn(
                    'integration-card-status',
                    model.status === 'error' && 'integration-card-status--error',
                )}
            >
                {model.statusLabel}
            </span>
        </>
    );
}
