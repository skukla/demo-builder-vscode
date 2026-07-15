/**
 * IntegrationResultRow — one collapsed result row in the Integrations center column.
 *
 * Purely presentational over a resolved {@link IntegrationRow}: name line, quiet
 * sourceLine, the destination line (committed → "Deploys to {label}" + Change;
 * needs setup → "Deploys to — Not set" + Set up), a quiet Remove on the right,
 * and a uniform, collapsible "APIs in use" section.
 *
 * The "APIs in use" section renders for EVERY kind — its header names the count
 * of the integration's provisioned APIs (`row.apis`) and expands to a stacked
 * list of their names, so a card reads the same whether it's a mesh, a catalog
 * integration, or a custom app. The list is COLLAPSED by default (read-only
 * feedback, kept out of the way); the count stays visible in the header. Only
 * editable rows (custom/import, which carry FREE API picks) get the quiet Change
 * that re-opens the picker (`onChangeApis`); mesh/catalog APIs are deterministic,
 * so their list is read-only.
 *
 * Remove works identically in create and edit sessions (in edit, removal only
 * drops the integration from the rebuild — no remote undeploy; the dashboard
 * owns deployed-app lifecycle). Plain divs with `.int-row-*` classes (styled
 * by custom-spectrum.css); no inline styles.
 *
 * @module features/project-creation/ui/components/integration-flow/IntegrationResultRow
 */

import { ActionButton } from '@adobe/react-spectrum';
import ChevronDown from '@spectrum-icons/workflow/ChevronDown';
import ChevronRight from '@spectrum-icons/workflow/ChevronRight';
import React, { useState } from 'react';
import { apiLabel } from './apiAccessConstants';
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
}: IntegrationResultRowProps): React.ReactElement {
    // The "APIs in use" list is read-only feedback, so it stays COLLAPSED by
    // default to keep the card uncluttered — the header keeps the count visible
    // ("APIs in use · 2"), and the names expand on demand (one click).
    const [apisExpanded, setApisExpanded] = useState(false);
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
            <div className="int-row-apis">
                <div className="int-row-apis-head">
                    <button
                        type="button"
                        className="int-row-apis-toggle"
                        aria-expanded={apisExpanded}
                        onClick={() => setApisExpanded((open) => !open)}
                    >
                        {apisExpanded ? (
                            <ChevronDown size="XS" aria-hidden="true" />
                        ) : (
                            <ChevronRight size="XS" aria-hidden="true" />
                        )}
                        <span className="int-row-apis-label">APIs in use</span>
                        <span className="int-row-apis-count">{row.apis.length}</span>
                    </button>
                    {isApiEditable(row.kind) && onChangeApis && (
                        <ActionButton isQuiet onPress={onChangeApis}>
                            Change
                        </ActionButton>
                    )}
                </div>
                {apisExpanded && (
                    <ul className="int-row-apis-list">
                        {row.apis.map((code) => (
                            <li key={code} className="int-row-api-item">
                                {apiLabel(code)}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
