/**
 * IntegrationResultRow — one collapsed result row in the Integrations center column.
 *
 * Purely presentational over a resolved {@link IntegrationRow}: name line, quiet
 * sourceLine, the destination line (committed → "Deploys to {label}" + Change;
 * needs setup → "Deploys to — Not set" + Set up), a quiet Remove on the right,
 * and — for mesh rows only — the caller's `meshEnableSlot` (a
 * {@link MeshApiEnableRow}) below the destination line.
 *
 * Custom/import rows (which carry FREE API picks) also get an editable API line:
 * "APIs: {n} selected" + a quiet Change that re-opens the picker (`onChangeApis`).
 * Mesh/catalog APIs are deterministic (never stored as picks) so those rows show
 * no API line.
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
    /** Re-open the picker for this integration's APIs (custom/import rows only). */
    onChangeApis?: () => void;
    /** Rendered below the destination line for mesh rows only. */
    meshEnableSlot?: React.ReactNode;
}

/** Whether a row carries editable free API picks (custom/import, not mesh/catalog). */
function isApiEditable(kind: IntegrationRow['kind']): boolean {
    return kind === 'blank' || kind === 'custom';
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
    onChangeApis,
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
            {isApiEditable(row.kind) && onChangeApis && (
                <div className="int-row-apis">
                    <span className="int-row-apis-text">
                        {row.apiCount > 0
                            ? `APIs: ${row.apiCount} selected`
                            : 'APIs — none selected'}
                    </span>
                    <ActionButton isQuiet onPress={onChangeApis}>
                        Change
                    </ActionButton>
                </div>
            )}
            {row.kind === 'mesh' && meshEnableSlot}
        </div>
    );
}
