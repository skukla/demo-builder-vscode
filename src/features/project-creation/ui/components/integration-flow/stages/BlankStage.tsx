/**
 * BlankStage — the Add Integration flow's blank instance-naming stage (`'source-blank'`).
 *
 * Mirrors CustomStage's evaluate-and-emit shape: a single TextField whose
 * validity feeds the modal footer via `onInstanceChange` — a valid,
 * non-colliding name emits the derived `{id, name}` instance (instanceId.ts);
 * anything else emits `undefined` (with an inline message for unusable or
 * colliding names). There is NO Add button here — the footer's Continue
 * commits; this stage only maintains validity.
 *
 * @module features/project-creation/ui/components/integration-flow/stages/BlankStage
 */

import { TextField } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import type { BlankInstance } from '../flowStages';
import { evaluateInstanceName } from '../instanceId';

export interface BlankStageProps {
    /** The collision domain (buildReservedIds) — a name slugging into it is rejected. */
    reservedIds: Set<string>;
    /** The draft's current instance (prefills the field when returning to this stage). */
    instance?: BlankInstance;
    /** Emit the derived instance on a valid, non-colliding name; undefined otherwise. */
    onInstanceChange: (instance: BlankInstance | undefined) => void;
}

const HINT = "A name you'll recognize — distinct from the API Mesh and other integrations.";

/**
 * The blank instance-naming stage body.
 *
 * @param props - the reserved-id domain, the draft instance, and the validity callback
 * @returns the naming form
 */
export function BlankStage({
    reservedIds,
    instance,
    onInstanceChange,
}: BlankStageProps): React.ReactElement {
    const [name, setName] = useState(() => instance?.name ?? '');
    const { message } = evaluateInstanceName(name, reservedIds);
    const handleChange = (next: string): void => {
        setName(next);
        onInstanceChange(evaluateInstanceName(next, reservedIds).instance);
    };
    return (
        <div className="intflow-blank">
            <p className="intflow-stage-lead">{HINT}</p>
            <TextField
                label="Integration name"
                placeholder="e.g. Order Sync, Salesforce CRM, Firefly Image Gen"
                value={name}
                onChange={handleChange}
                validationState={message ? 'invalid' : undefined}
                errorMessage={message}
                width="100%"
            />
        </div>
    );
}
