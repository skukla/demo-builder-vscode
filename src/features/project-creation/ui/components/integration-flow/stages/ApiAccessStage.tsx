/**
 * ApiAccessStage — the api-access step for MESH and CATALOG integrations, whose
 * APIs are DETERMINISTIC.
 *
 * INFORMATIONAL, not interactive. It TELLS the user which Adobe APIs the
 * integration NEEDS — it never asks them to pick (that's the custom/import path's
 * {@link import('./ApiPickerStage').ApiPickerStage}). The copy is action-framed:
 * these APIs aren't magically included; adding the integration ENABLES them.
 *
 * Lists the required APIs (from the catalog, resolved to short labels) plus the
 * baseline Adobe I/O access every App Builder integration needs. It renders
 * instantly from static data (no org-API fetch, no loading, no timeout).
 *
 * The modal provisions NOTHING — every API is subscribed later, at the rebuild —
 * so this step never runs an enable. State is carried by the row ICON alone, never
 * a per-row word (reusing the wizard StatusSection vocabulary): an API waiting to
 * be enabled at the rebuild shows a Clock (pending), NOT a ✓.
 *
 * API access is PROJECT-LEVEL: an API another integration in this project already
 * covers (`alreadyEnabled`) shows ✓ from the start, never pending — so adding a
 * second integration doesn't ask the user to re-add what the project already has.
 *
 * @module features/project-creation/ui/components/integration-flow/stages/ApiAccessStage
 */

import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Clock from '@spectrum-icons/workflow/Clock';
import React from 'react';
import { apiLabel, BASELINE_CODE } from '../apiAccessConstants';

export interface ApiAccessStageProps {
    /** The integration's REQUIRED API sdk codes (catalog `requiredApis`). */
    required?: string[];
    /**
     * API codes already enabled on the workspace by OTHER integrations in this
     * project. API access is PROJECT-LEVEL — the rebuild subscribes the union of
     * every integration's APIs (+ the shared baseline) — so an API another
     * integration already covers renders as ✓ "already enabled", never pending. A
     * new integration should not ask the user to add what the project already has.
     */
    alreadyEnabled?: string[];
}

/** Stable empty default so an omitted `required` never churns identity. */
const NO_REQUIRED: string[] = [];

/** Stable empty default so an omitted `alreadyEnabled` never churns identity. */
const NO_ENABLED: string[] = [];

/**
 * The informational API-access step for mesh/catalog (deterministic APIs).
 *
 * @param props - the catalog required codes + already-enabled project APIs
 * @returns the read-only "API access" panel
 */
export function ApiAccessStage({
    required = NO_REQUIRED,
    alreadyEnabled = NO_ENABLED,
}: ApiAccessStageProps): React.ReactElement {
    // Required first (the integration's headline API on top), baseline always
    // included after. De-duped so a required code that IS the baseline shows once.
    const codes = [...new Set([...required, BASELINE_CODE])];
    // Whether ANY of this integration's APIs are net-new to the project. When all
    // are already covered by other integrations, there is nothing to add — the copy
    // says so instead of claiming the rebuild enables them.
    const hasNewApis = codes.some((code) => !alreadyEnabled.includes(code));
    // The row's state indicator, reusing the wizard StatusSection vocabulary
    // (Clock = pending, CheckmarkCircle = done): a blue Clock while an API is still
    // waiting to be enabled at the rebuild, and a green ✓ for an API another
    // integration already covers (project-level API access). State lives in the icon.
    const rowIcon = (code: string): React.ReactElement => {
        const label = apiLabel(code);
        if (alreadyEnabled.includes(code)) {
            return (
                <CheckmarkCircle
                    size="S"
                    UNSAFE_className="text-green-600"
                    aria-label={`${label} enabled`}
                />
            );
        }
        return <Clock size="S" UNSAFE_className="text-blue-600" aria-label={`${label} pending`} />;
    };
    return (
        <div className="intflow-api-info" data-testid="api-access-stage">
            <div className="intflow-api-info-head">API access</div>
            <p className="intflow-api-info-sub">
                {hasNewApis
                    ? 'This integration needs these Adobe APIs. They are enabled on your Adobe workspace when this integration deploys.'
                    : 'This integration uses Adobe APIs already enabled on your workspace — nothing new to add.'}
            </p>
            <div className="intflow-api-summary-section" data-testid="api-access-included">
                {codes.map((code) => (
                    <div key={code} className="intflow-api-summary-item">
                        {rowIcon(code)}
                        <span className="intflow-api-summary-name">{apiLabel(code)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
