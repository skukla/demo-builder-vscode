/**
 * IntegrationResultRow — one collapsed result row in the Integrations center column.
 *
 * Purely presentational over a resolved {@link IntegrationRow}: name line, quiet
 * sourceLine, the destination line (committed → "Deploys to {label}" + Change;
 * needs setup → "Deploys to — Not set" + Set up), a quiet Remove on the right,
 * an optional "APIs: {n} selected" line, and — for mesh rows only — the caller's
 * `meshEnableSlot` (a {@link MeshApiEnableRow}) below the destination line.
 *
 * Remove works identically in create and edit sessions (in edit, removal only
 * drops the integration from the rebuild — no remote undeploy; the dashboard
 * owns deployed-app lifecycle). Plain divs with `.int-row-*` classes (styled
 * by custom-spectrum.css); no inline styles.
 *
 * @module features/project-creation/ui/components/integration-flow/IntegrationResultRow
 */

import { ActionButton } from '@adobe/react-spectrum';
import React from 'react';
import type { IntegrationRow } from './integrationRows';

export interface IntegrationResultRowProps {
    row: IntegrationRow;
    /** Committed destination, e.g. "Kukla Mesh · Stage" (shown when not needsSetup). */
    destinationLabel?: string;
    /** Opens the modal in destination mode for an unconfigured destination. */
    onSetUpDestination: () => void;
    /** Opens the modal in destination mode to change the committed destination. */
    onChangeDestination: () => void;
    onRemove: () => void;
    /** Rendered below the destination line for mesh rows only. */
    meshEnableSlot?: React.ReactNode;
}

/** The destination line: committed reference + Change, or "Not set" + Set up. */
function DestinationLine({
    needsSetup,
    destinationLabel,
    onSetUpDestination,
    onChangeDestination,
}: {
    needsSetup: boolean;
    destinationLabel?: string;
    onSetUpDestination: () => void;
    onChangeDestination: () => void;
}): React.ReactElement {
    if (needsSetup) {
        return (
            <div className="int-row-destination">
                <span className="int-row-dest-text">Deploys to — Not set</span>
                <ActionButton isQuiet onPress={onSetUpDestination}>
                    Set up
                </ActionButton>
            </div>
        );
    }
    return (
        <div className="int-row-destination">
            <span className="int-row-dest-text">{`Deploys to ${destinationLabel ?? ''}`}</span>
            <ActionButton isQuiet onPress={onChangeDestination}>
                Change
            </ActionButton>
        </div>
    );
}

/**
 * One collapsed integration result row.
 *
 * @param props - the resolved row, destination label, and the row's callbacks
 * @returns the result row
 */
export function IntegrationResultRow({
    row,
    destinationLabel,
    onSetUpDestination,
    onChangeDestination,
    onRemove,
    meshEnableSlot,
}: IntegrationResultRowProps): React.ReactElement {
    return (
        <div className="int-row">
            <div className="int-row-header">
                <span className="int-row-name">{row.name}</span>
                <ActionButton isQuiet onPress={onRemove}>
                    Remove
                </ActionButton>
            </div>
            <div className="int-row-source">{row.sourceLine}</div>
            <DestinationLine
                needsSetup={row.needsSetup}
                destinationLabel={destinationLabel}
                onSetUpDestination={onSetUpDestination}
                onChangeDestination={onChangeDestination}
            />
            {row.apiCount > 0 && (
                <div className="int-row-apis">{`APIs: ${row.apiCount} selected`}</div>
            )}
            {row.kind === 'mesh' && meshEnableSlot}
        </div>
    );
}
