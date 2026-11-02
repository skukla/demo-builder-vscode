/**
 * ApiPickerStage — the INTERACTIVE api-access step for a custom/import app.
 *
 * Unlike mesh/catalog (deterministic, fixed APIs), a custom "Build custom" or
 * imported repo app can need ANY Adobe API the user is entitled to — and the user
 * often knows which up front (e.g. building Commerce ↔ Firefly Services, you need
 * the Firefly Services APIs). So this step shows the org's subscribable services
 * (with the baseline + APIs other integrations already cover flagged `locked`) and
 * lets the user pick freely via the shared {@link ApiAccessPicker}. Picks are recorded
 * on the flow draft and subscribed at the rebuild; nothing is forced (the baseline is
 * always covered).
 *
 * Only the list: reading it ({@link useOrgApis}), the wait and what a failed read says are
 * the dialog's own, so they replace the whole body and its buttons.
 *
 * @module features/project-creation/ui/components/integration-flow/stages/ApiPickerStage
 */

import React from 'react';
import { ApiAccessPicker, type ApiAccessOption } from '@/core/ui/components/selection/ApiAccessPicker';

export interface ApiPickerStageProps {
    /** The org's services, read by the dialog. */
    apis: ApiAccessOption[];
    /** The user's free picks so far (from the flow draft). */
    selected: string[];
    /** Toggle a free pick by code. */
    onToggle: (code: string) => void;
}

const HELPER = 'Pick the Adobe APIs this app needs — change them anytime in Manage APIs.';

/**
 * The interactive API-access step for custom/import apps.
 *
 * @param props - the org's APIs, current picks, and toggle
 * @returns the picker, using the full modal width for its filter, chips and list
 */
export function ApiPickerStage({ apis, selected, onToggle }: ApiPickerStageProps): React.ReactElement {
    return (
        <div className="intflow-api-info intflow-api-info--full" data-testid="api-picker-stage">
            <ApiAccessPicker apis={apis} selected={selected} onToggle={onToggle} helperText={HELPER} />
        </div>
    );
}
