/**
 * StepStatusIcon — where one item in a list of work has got to: waiting, running, done,
 * failed, or done with something to know.
 *
 * Moved out of the Prerequisites step (2026-10-21) when the Updates modal began showing
 * its run the same way, row by row, so the two lists draw each state alike.
 *
 * @module core/ui/components/feedback/StepStatusIcon
 */

import Pending from '@spectrum-icons/workflow/Pending';
import React from 'react';
import { StatusIcon } from '@/core/ui/components/feedback/StatusIcon';
import { Spinner } from '@/core/ui/components/ui/Spinner';

/** Where an item has got to. */
export type StepStatus = 'pending' | 'checking' | 'success' | 'error' | 'warning';

/** The icon for one item's status. */
export function StepStatusIcon({ status }: { status: StepStatus }): React.ReactElement {
    switch (status) {
        case 'success':
            return <StatusIcon status="success" />;
        case 'error':
            return <StatusIcon status="row-error" />;
        case 'warning':
            return <StatusIcon status="warning" />;
        case 'checking':
            return <Spinner size="S" />;
        case 'pending':
            return <Pending size="S" />;
    }
}
