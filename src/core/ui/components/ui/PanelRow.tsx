/**
 * One labelled row of a detail flyout: a key column and a value column.
 * Shared by the integration and datapack flyouts, so their rows read alike.
 *
 * @module core/ui/components/ui/PanelRow
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
