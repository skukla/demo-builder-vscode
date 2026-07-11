/**
 * ApiAccessStage — the API-access stage of the Add Integration flow.
 *
 * PRESENTATIONAL and TWO-COLUMN, reusing the builder's center-work/right-summary
 * grammar:
 *   - CENTER: the filterable {@link ApiAccessPicker} of FREE APIs only (locked
 *     entries are filtered out — required APIs are facts, not disabled
 *     checkboxes), with the add-later guidance copy; a compact loading row
 *     while the journey prefetch is pending and an inline error + Retry on
 *     failure.
 *   - RIGHT ("API Access" summary): the single source of truth for what this
 *     integration gets. Its Applied section lists the locked/required APIs —
 *     or renders the caller's `appliedSlot` (mesh passes its live enable row:
 *     spinner → ✓ names → ⚠ Retry). Its Selected section mirrors the user's
 *     free picks by display name.
 *
 * The org fetch lives at the JOURNEY level ({@link useOrgConsoleApis}), fired
 * the moment the integration pick is known — so the list is usually READY
 * before the user reaches this stage, and the stage shows at most ONE spinner.
 *
 * This stage NEVER blocks the flow's Continue (no canProceed wiring): locked
 * APIs are subscribed by the union regardless, and free picks are optional.
 *
 * @module features/project-creation/ui/components/integration-flow/stages/ApiAccessStage
 */

import { ActionButton } from '@adobe/react-spectrum';
import React from 'react';
import type { OrgConsoleApisState } from '../useOrgConsoleApis';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { ApiAccessPicker, type ApiAccessOption } from '@/core/ui/components/selection';

/** The picker's guidance line — including the add-later escape hatch. */
const API_ACCESS_HELPER =
    'Your picks grant this app’s actions access to those Adobe APIs — you can also ' +
    'add APIs later from the dashboard (Manage APIs) or by asking the AI.';

export interface ApiAccessStageProps {
    /** The journey-prefetched org APIs (status + rows + retry). */
    orgApis: OrgConsoleApisState;
    /** Curated suggestion codes (catalog `suggestedApis`) for the picked entry. */
    suggested?: string[];
    /** The user's free picks for THIS integration (draft-local). */
    selected: string[];
    /** Toggle a free pick by code. */
    onToggle: (code: string) => void;
    /**
     * Replaces the Applied section's locked list — mesh passes its live
     * enable row so the summary carries the provisioning state itself.
     */
    appliedSlot?: React.ReactNode;
}

/** The center column: loading row → inline error + Retry → the free-API picker. */
function CenterColumn({
    orgApis,
    freeApis,
    suggested,
    selected,
    onToggle,
}: {
    orgApis: OrgConsoleApisState;
    freeApis: ApiAccessOption[];
    suggested?: string[];
    selected: string[];
    onToggle: (code: string) => void;
}): React.ReactElement {
    if (orgApis.status === 'loading') {
        return <LoadingDisplay size="M" message="Loading Adobe APIs…" />;
    }
    if (orgApis.status === 'error') {
        return (
            <div className="intflow-api-error" role="alert">
                <span className="intflow-api-error-message">{orgApis.error}</span>
                <ActionButton isQuiet onPress={orgApis.retry}>
                    Retry
                </ActionButton>
            </div>
        );
    }
    return (
        <ApiAccessPicker
            apis={freeApis}
            suggested={suggested}
            selected={selected}
            onToggle={onToggle}
            helperText={API_ACCESS_HELPER}
        />
    );
}

/** The right summary column: Applied (locked facts or the caller's slot) + Selected. */
function SummaryColumn({
    lockedApis,
    allApis,
    selected,
    appliedSlot,
}: {
    lockedApis: ApiAccessOption[];
    allApis: ApiAccessOption[];
    selected: string[];
    appliedSlot?: React.ReactNode;
}): React.ReactElement {
    return (
        <aside className="intflow-api-summary" data-testid="api-access-summary">
            <div className="intflow-api-summary-title">API Access</div>
            <div className="intflow-api-summary-section" data-testid="api-summary-applied">
                <div className="intflow-api-summary-heading">Applied</div>
                {appliedSlot ??
                    (lockedApis.length > 0 ? (
                        lockedApis.map((api) => (
                            <div key={api.code} className="intflow-api-summary-item">
                                <span className="int-chosen-check" aria-hidden="true">
                                    ✓
                                </span>
                                <span>{api.name}</span>
                            </div>
                        ))
                    ) : (
                        <div className="intflow-api-summary-empty">—</div>
                    ))}
            </div>
            <div className="intflow-api-summary-section" data-testid="api-summary-selected">
                <div className="intflow-api-summary-heading">Selected</div>
                {selected.length > 0 ? (
                    selected.map((code) => (
                        <div key={code} className="intflow-api-summary-item">
                            {allApis.find((api) => api.code === code)?.name ?? code}
                        </div>
                    ))
                ) : (
                    <div className="intflow-api-summary-empty">None — optional</div>
                )}
            </div>
        </aside>
    );
}

/**
 * The two-column API-access stage body.
 *
 * @param props - the prefetched org APIs, curated suggestions, picks + toggle,
 *   and the optional Applied slot
 * @returns the center picker column + the right API Access summary column
 */
export function ApiAccessStage({
    orgApis,
    suggested,
    selected,
    onToggle,
    appliedSlot,
}: ApiAccessStageProps): React.ReactElement {
    const freeApis = orgApis.apis.filter((api) => !api.locked);
    const lockedApis = orgApis.apis.filter((api) => api.locked);
    return (
        <div className="intflow-api-stage" data-testid="api-access-stage">
            <div className="intflow-api-columns">
                <div className="intflow-api-main">
                    <CenterColumn
                        orgApis={orgApis}
                        freeApis={freeApis}
                        suggested={suggested}
                        selected={selected}
                        onToggle={onToggle}
                    />
                </div>
                <SummaryColumn
                    lockedApis={lockedApis}
                    allApis={orgApis.apis}
                    selected={selected}
                    appliedSlot={appliedSlot}
                />
            </div>
        </div>
    );
}
