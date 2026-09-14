/**
 * One labelled row of the integration flyout: a key column and a value column.
 * Shared by the panel and the bound system's section, so both rows read alike.
 *
 * @module features/dashboard/ui/components/integrations/PanelRow
 */

import React from 'react';
import { cn } from '@/core/ui/utils/classNames';

export function PanelRow({
    label,
    mono = false,
    children,
}: {
    label: string;
    mono?: boolean;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <div className="integration-panel-row">
            <span className="integration-panel-row-key">{label}</span>
            <span
                className={cn(
                    'integration-panel-row-value',
                    mono && 'integration-panel-row-value--mono',
                )}
            >
                {children}
            </span>
        </div>
    );
}
