/**
 * The one icon for how something stands, on every surface: the wizard's set, which the dialogs and
 * screens follow (owner, 2026-11-02). `row-error` is a failed item in a list; `error` is a failed
 * screen or dialog. Enforced by `tests/sop/status-icons.test.ts`.
 *
 * `StepStatusIcon` adds a list's waiting and running states on top of this, and `StatusDisplay` is
 * a whole view around it. Neither could be the home: one is rows at one size, the other a layout.
 *
 * @module core/ui/components/feedback/StatusIcon
 */

import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import CloseCircle from '@spectrum-icons/workflow/CloseCircle';
import InfoOutline from '@spectrum-icons/workflow/InfoOutline';
import React from 'react';

export type StatusIconStatus = 'warning' | 'error' | 'row-error' | 'success' | 'info';

export interface StatusIconProps {
    status: StatusIconStatus;
    size?: 'XS' | 'S' | 'M' | 'L';
    marginStart?: React.ComponentProps<typeof AlertCircle>['marginStart'];
}

export function StatusIcon({ status, size = 'S', marginStart }: StatusIconProps): React.ReactElement {
    switch (status) {
        case 'warning':
            return <AlertCircle size={size} marginStart={marginStart} UNSAFE_className="text-orange-600" />;
        case 'error':
            return <AlertCircle size={size} marginStart={marginStart} UNSAFE_className="text-red-600" />;
        case 'row-error':
            return <CloseCircle size={size} marginStart={marginStart} UNSAFE_className="text-red-600" />;
        case 'success':
            return <CheckmarkCircle size={size} marginStart={marginStart} UNSAFE_className="text-green-600" />;
        case 'info':
            return <InfoOutline size={size} marginStart={marginStart} UNSAFE_className="text-blue-600" />;
    }
}
