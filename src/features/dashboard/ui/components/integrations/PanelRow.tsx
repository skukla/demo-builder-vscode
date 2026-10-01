/**
 * One labelled row of the integration flyout: a key column and a value column.
 * Shared by the panel and the bound system's section, so both rows read alike.
 *
 * @module features/dashboard/ui/components/integrations/PanelRow
 */

import React from 'react';

export function PanelRow({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <div className="integration-panel-row">
            <span className="integration-panel-row-key">{label}</span>
            <span className="integration-panel-row-value">{children}</span>
        </div>
    );
}
