/**
 * ApiAccessStage — the API-access step of the Add Integration flow.
 *
 * INFORMATIONAL, not interactive. Integrations are deterministic: their API
 * access is fixed and subscribed automatically at deploy, so this step only
 * TELLS the user what the integration grants — it never asks them to pick.
 *
 * Shows the always-on set as facts: the integration's required APIs (from the
 * catalog, resolved to short labels) plus the baseline Adobe I/O access that
 * every App Builder integration gets. It renders instantly from static data (no
 * org-API fetch, no loading, no timeout). A custom app — whose API surface isn't
 * known up front — additionally notes that more APIs are granted as it's built,
 * from the dashboard's Manage APIs.
 *
 * @module features/project-creation/ui/components/integration-flow/stages/ApiAccessStage
 */

import React from 'react';

/** The baseline Adobe I/O API every App Builder integration subscribes at deploy. */
const BASELINE_CODE = 'AdobeIOManagementAPISDK';

/**
 * Short, stable display names for the small set of APIs shown here. The org
 * list's real names are verbose ("API Mesh for Adobe Developer App Builder");
 * these are the friendly, instant labels. A code with no entry falls back to
 * itself (still readable — these are curated required/baseline codes).
 */
const API_LABELS: Record<string, string> = {
    GraphQLServiceSDK: 'API Mesh',
    [BASELINE_CODE]: 'I/O Management API',
};

export interface ApiAccessStageProps {
    /** The integration's REQUIRED API sdk codes (catalog `requiredApis`). */
    required?: string[];
    /** A custom app (blank shell or imported repo) — note the build-time grants. */
    custom?: boolean;
}

/** Stable empty default so an omitted `required` never churns identity. */
const NO_REQUIRED: string[] = [];

/**
 * The informational API-access step: the always-on APIs this integration grants.
 *
 * @param props - the catalog required codes and whether this is a custom app
 * @returns the read-only "API access included" panel
 */
export function ApiAccessStage({
    required = NO_REQUIRED,
    custom = false,
}: ApiAccessStageProps): React.ReactElement {
    const labelFor = (code: string): string => API_LABELS[code] ?? code;
    // Required first (the integration's headline API on top), baseline always
    // included after. De-duped so a required code that IS the baseline shows once.
    const codes = [...new Set([...required, BASELINE_CODE])];
    return (
        <div className="intflow-api-info" data-testid="api-access-stage">
            <div className="intflow-api-info-head">API access included</div>
            <p className="intflow-api-info-sub">
                These Adobe APIs are granted automatically when this integration deploys — nothing
                to configure.
            </p>
            <div className="intflow-api-summary-section" data-testid="api-access-included">
                {codes.map((code) => (
                    <div key={code} className="intflow-api-summary-item">
                        <span className="int-chosen-check" aria-hidden="true">
                            ✓
                        </span>
                        <span className="intflow-api-summary-name">{labelFor(code)}</span>
                        <span className="intflow-api-tag">Always on</span>
                    </div>
                ))}
            </div>
            {custom && (
                <p className="intflow-api-info-note">
                    This is a custom app — grant whatever additional Adobe APIs it needs as you
                    build it, anytime from the dashboard (Manage APIs) or by asking the AI.
                </p>
            )}
        </div>
    );
}
