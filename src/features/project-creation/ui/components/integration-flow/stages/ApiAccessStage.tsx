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
 * State is carried by the row ICON alone, never a per-row word (reusing the wizard
 * StatusSection vocabulary): an API waiting to be enabled shows a Clock (pending) —
 * NOT a ✓, since nothing is enabled yet. While the mesh enable runs on Add
 * (`enabling`), the row shows a spinner until that API's subscribe lands (per-API,
 * from `enableDone`), then a green CheckmarkCircle. On success `enableComplete`
 * grants EVERY row — the result is authoritative, so a dropped progress tick can't
 * strand a row on pending while the whole enable succeeded.
 *
 * API access is PROJECT-LEVEL: an API another integration in this project already
 * covers (`alreadyEnabled`) shows ✓ from the start, never pending — so adding a
 * second integration doesn't ask the user to re-add what the project already has.
 *
 * @module features/project-creation/ui/components/integration-flow/stages/ApiAccessStage
 */

import { ProgressCircle } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Clock from '@spectrum-icons/workflow/Clock';
import React from 'react';
import { BASELINE_CODE } from '../apiAccessConstants';

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
    /**
     * The enable happens HERE, in this step (mesh: the Add press runs the
     * subscribe). When false the APIs are enabled later, at deploy (catalog/
     * custom) — the copy reflects WHEN, so it never claims "adding enables them".
     */
    enablesOnAdd?: boolean;
    /** The mesh enable is running on Add — show each not-yet-granted API as a spinner. */
    enabling?: boolean;
    /** Per-API completion during the enable (sdk code → true once it subscribes). */
    enableDone?: Record<string, boolean>;
    /**
     * The enable finished successfully — EVERY row is granted (✓), authoritative
     * over `enableDone`. The per-API ticks are best-effort progressive feedback; a
     * dropped tick must not leave a row stuck pending when the whole enable
     * succeeded (the success result is the source of truth for "all done").
     */
    enableComplete?: boolean;
    /**
     * API codes already enabled on the workspace by OTHER integrations in this
     * project. API access is PROJECT-LEVEL — the deploy subscribes the union of
     * every integration's APIs (+ the shared baseline) — so an API another
     * integration already covers renders as ✓ "already enabled", never pending. A
     * new integration should not ask the user to add what the project already has.
     */
    alreadyEnabled?: string[];
}

/** Stable empty default so an omitted `required` never churns identity. */
const NO_REQUIRED: string[] = [];

/** Stable empty default so an omitted `enableDone` never churns identity. */
const NO_DONE: Record<string, boolean> = {};

/** Stable empty default so an omitted `alreadyEnabled` never churns identity. */
const NO_ENABLED: string[] = [];

/**
 * The informational API-access step for mesh/catalog (deterministic APIs).
 *
 * @param props - the catalog required codes + enable/already-enabled state
 * @returns the read-only "API access" panel
 */
export function ApiAccessStage({
    required = NO_REQUIRED,
    enabling = false,
    enableDone = NO_DONE,
    enableComplete = false,
    enablesOnAdd = false,
    alreadyEnabled = NO_ENABLED,
}: ApiAccessStageProps): React.ReactElement {
    const labelFor = (code: string): string => API_LABELS[code] ?? code;
    // WHEN the not-yet-enabled APIs get enabled, stated honestly (never "adding
    // enables them"): mesh enables them right here in this step; catalog/custom
    // enable them later, at deploy. (Single ternary — not nested.)
    const accessNote = enablesOnAdd
        ? 'This step enables them on your Adobe workspace.'
        : 'They are enabled on your Adobe workspace when this integration deploys.';
    // Required first (the integration's headline API on top), baseline always
    // included after. De-duped so a required code that IS the baseline shows once.
    const codes = [...new Set([...required, BASELINE_CODE])];
    // Whether ANY of this integration's APIs are net-new to the project. When all
    // are already covered by other integrations, there is nothing to add — the copy
    // says so instead of claiming this step/deploy enables them.
    const hasNewApis = codes.some((code) => !alreadyEnabled.includes(code));
    // The row's state indicator, reusing the wizard StatusSection vocabulary
    // (Clock = pending, CheckmarkCircle = done): a blue Clock while an API is
    // still waiting to be enabled, a spinner while its subscribe runs on Add,
    // then a green ✓ once granted. An API already enabled by another integration is
    // granted from the start (project-level API access). `enableComplete` grants
    // EVERY row (the success result is authoritative). State lives in the icon.
    const rowIcon = (code: string): React.ReactElement => {
        const label = labelFor(code);
        const granted = alreadyEnabled.includes(code) || enableComplete || enableDone[code];
        if (enabling && !granted) {
            return <ProgressCircle size="S" isIndeterminate aria-label={`Enabling ${label}`} />;
        }
        if (granted) {
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
                    ? `This integration needs these Adobe APIs. ${accessNote}`
                    : 'This integration uses Adobe APIs already enabled on your workspace — nothing new to add.'}
            </p>
            <div className="intflow-api-summary-section" data-testid="api-access-included">
                {codes.map((code) => (
                    <div key={code} className="intflow-api-summary-item">
                        {rowIcon(code)}
                        <span className="intflow-api-summary-name">{labelFor(code)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
