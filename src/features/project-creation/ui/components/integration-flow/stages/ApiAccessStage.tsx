/**
 * ApiAccessStage — the API-access stage of the Add Integration flow.
 *
 * A lean two-column stage. Selection ≠ provisioning: this screen only chooses
 * APIs; nothing is subscribed here (that happens at deploy). The two columns each
 * have ONE job:
 *   - LEFT (browse): the filterable {@link ApiAccessPicker} of the org's
 *     subscribable APIs — pickable ones as checkboxes, profile-bound ones
 *     delineated (disabled) — plus a compact loading row and an inline error +
 *     Retry. Loads independently; a slow/failed org fetch degrades HERE only.
 *   - RIGHT ("Included"): the one thing the list can't show — the integration's
 *     REQUIRED APIs. Sourced from the CATALOG (`required` codes), so it renders
 *     INSTANTLY and stays populated even when the org list is slow or times out.
 *     Names are enriched from the org list when it lands; the code is the fallback.
 *
 * There is NO live "enable" here and NO Selected mirror: the user's picks are the
 * checked rows in the list (with an at-a-glance "N added" count). The stage NEVER
 * blocks the flow's Continue.
 *
 * @module features/project-creation/ui/components/integration-flow/stages/ApiAccessStage
 */

import { ActionButton } from '@adobe/react-spectrum';
import React from 'react';
import type { OrgConsoleApisState } from '../useOrgConsoleApis';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { ApiAccessPicker, type ApiAccessOption } from '@/core/ui/components/selection';

/** The picker's guidance line — the add-later escape hatch (the header says the rest). */
const API_ACCESS_HELPER = 'You can also add APIs later from the dashboard or by asking the AI.';

/**
 * Short, stable display names for the small set of APIs we mark REQUIRED, shown
 * in the Included panel. The org list's real name is often verbose ("API Mesh
 * for Adobe Developer App Builder") AND absent while it loads — so the panel
 * would flash the raw sdkCode, then a 3-line name. A curated short label renders
 * instantly and never changes. Only required codes need an entry; anything
 * missing falls back to the org name, then the code (graceful, self-healing).
 */
const REQUIRED_API_SHORT_NAMES: Record<string, string> = {
    GraphQLServiceSDK: 'API Mesh',
};

/** Stable empty default so an omitted `required` never churns identity. */
const NO_REQUIRED: string[] = [];

export interface ApiAccessStageProps {
    /** The journey-prefetched org APIs (status + rows + retry). */
    orgApis: OrgConsoleApisState;
    /**
     * The integration's REQUIRED API sdk codes (from the catalog). Rendered as
     * the Included facts INSTANTLY — independent of the org fetch — so a slow or
     * timed-out list never leaves the screen blank.
     */
    required?: string[];
    /** Curated suggestion codes (catalog `suggestedApis`) for the picked entry. */
    suggested?: string[];
    /** The user's free picks for THIS integration (draft-local). */
    selected: string[];
    /** Toggle a free pick by code. */
    onToggle: (code: string) => void;
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
        <>
            <div className="intflow-api-browse-head">
                <span>Add more APIs (optional)</span>
                {selected.length > 0 && (
                    <span className="intflow-api-added">· {selected.length} added</span>
                )}
            </div>
            <ApiAccessPicker
                apis={freeApis}
                suggested={suggested}
                selected={selected}
                onToggle={onToggle}
                helperText={API_ACCESS_HELPER}
            />
        </>
    );
}

/**
 * The right "Included" column — everything this integration will carry.
 *
 * Two tiers:
 *   - ALWAYS ON: the union of the catalog `required` codes (known INSTANTLY, so
 *     the panel renders before the org list lands) and every `locked` row the org
 *     list reports (the reconcile union: baseline `AdobeIOManagementAPISDK` +
 *     required + any selected project component). Rendered as facts (green ✓).
 *   - ADDED: the user's optional picks (`selected`), each with an inline × to
 *     remove it (calls `onToggle`) — so Included is both the "what you're
 *     committing" summary and the un-pick surface, not just a count.
 *
 * Names resolve short-label → org name → code. Never blocks on the fetch.
 */
function IncludedColumn({
    required,
    allApis,
    selected,
    onToggle,
}: {
    required: string[];
    allApis: ApiAccessOption[];
    selected: string[];
    onToggle: (code: string) => void;
}): React.ReactElement | null {
    const lockedCodes = allApis.filter((api) => api.locked).map((api) => api.code);
    // Required first (instant, keeps the integration's headline API on top), then
    // any locked codes the org list adds (baseline, project mesh). De-duped, order-stable.
    const alwaysOn = [...new Set([...required, ...lockedCodes])];
    // Picks are non-locked by construction, but guard against overlap anyway.
    const added = selected.filter((code) => !alwaysOn.includes(code));
    if (alwaysOn.length === 0 && added.length === 0) return null;
    const nameFor = (code: string): string =>
        REQUIRED_API_SHORT_NAMES[code] ?? allApis.find((api) => api.code === code)?.name ?? code;
    return (
        <aside className="intflow-api-summary" data-testid="api-access-summary">
            <div className="intflow-api-summary-title">Included</div>
            {alwaysOn.length > 0 && (
                <div className="intflow-api-summary-section" data-testid="api-summary-included">
                    {alwaysOn.map((code) => (
                        <div key={code} className="intflow-api-summary-item">
                            <span className="int-chosen-check" aria-hidden="true">
                                ✓
                            </span>
                            <span className="intflow-api-summary-name">{nameFor(code)}</span>
                            <span className="intflow-api-tag">Always on</span>
                        </div>
                    ))}
                </div>
            )}
            {added.length > 0 && (
                <div className="intflow-api-summary-section" data-testid="api-summary-added">
                    <div className="intflow-api-summary-subhead">Added</div>
                    {added.map((code) => (
                        <div key={code} className="intflow-api-summary-item">
                            <span className="intflow-api-summary-name">{nameFor(code)}</span>
                            <button
                                type="button"
                                className="intflow-api-summary-remove"
                                aria-label={`Remove ${nameFor(code)}`}
                                onClick={() => onToggle(code)}
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </aside>
    );
}

/**
 * The two-column API-access stage body.
 *
 * @param props - the prefetched org APIs, the catalog required codes, curated
 *   suggestions, and the picks + toggle
 * @returns the center picker column + the right Included column
 */
export function ApiAccessStage({
    orgApis,
    required = NO_REQUIRED,
    suggested,
    selected,
    onToggle,
}: ApiAccessStageProps): React.ReactElement {
    // Non-locked APIs go to the picker (which delineates profile-bound). Locked
    // ones are the required set — shown in the Included column, not the list.
    const freeApis = orgApis.apis.filter((api) => !api.locked);
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
                <IncludedColumn
                    required={required}
                    allApis={orgApis.apis}
                    selected={selected}
                    onToggle={onToggle}
                />
            </div>
        </div>
    );
}
