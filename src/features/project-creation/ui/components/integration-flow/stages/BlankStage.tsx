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
 * SEEDS: when the stack's catalog offers pre-built integrations, they appear as
 * starting points beside the blank shell (`ChoiceCard` row — the kind picker's
 * own pattern). The pick lands in the draft as `seedId`; the commit clones the
 * seed's repo under the instance's name, and the seed's capability fields
 * survive via the loader's source recognition. A seed whose catalog id is
 * already selected is disabled with the reason — its generation of apps carries
 * fixed package names, one per workspace (the add door enforces the same rule
 * for cases this hint cannot see).
 *
 * @module features/project-creation/ui/components/integration-flow/stages/BlankStage
 */

import { TextField } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { ChoiceCard } from '../../ChoiceCard';
import type { BlankInstance } from '../flowStages';
import { evaluateInstanceName } from '../instanceId';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

export interface BlankStageProps {
    /** The collision domain (buildReservedIds) — a name slugging into it is rejected. */
    reservedIds: Set<string>;
    /** The draft's current instance (prefills the field when returning to this stage). */
    instance?: BlankInstance;
    /** Emit the derived instance on a valid, non-colliding name; undefined otherwise. */
    onInstanceChange: (instance: BlankInstance | undefined) => void;
    /** Pre-built entries offered as starting points (empty hides the seed row). */
    seeds?: AppBuilderComponentCatalogEntry[];
    /** The draft's picked seed id (undefined = blank shell). */
    seedId?: string;
    /** Already-selected component ids — a seed whose id is among them is disabled. */
    selectedIds?: string[];
    /** Pick a seed (undefined returns to the blank shell). */
    onSeedChange?: (seedId: string | undefined) => void;
}

const HINT = "A name you'll recognize — distinct from the API Mesh and other integrations.";

/**
 * The blank instance-naming stage body.
 *
 * @param props - the reserved-id domain, the draft instance/seed, and the callbacks
 * @returns the naming form (with the seed row when the catalog offers any)
 */
export function BlankStage({
    reservedIds,
    instance,
    onInstanceChange,
    seeds = [],
    seedId,
    selectedIds = [],
    onSeedChange,
}: BlankStageProps): React.ReactElement {
    const [name, setName] = useState(() => instance?.name ?? '');
    const { message } = evaluateInstanceName(name, reservedIds);
    const handleChange = (next: string): void => {
        setName(next);
        onInstanceChange(evaluateInstanceName(next, reservedIds).instance);
    };
    return (
        <div className="intflow-blank">
            {seeds.length > 0 ? (
                <div className="intflow-kind-choices">
                    <ChoiceCard
                        name="Blank"
                        description="An empty custom integration — build it out with AI."
                        selected={seedId === undefined}
                        onSelect={() => onSeedChange?.(undefined)}
                    />
                    {seeds.map((seed) => {
                        const alreadyAdded = selectedIds.includes(seed.id);
                        return (
                            <ChoiceCard
                                key={seed.id}
                                name={seed.name}
                                description={`Start from ${seed.name} and customize it.`}
                                selected={seedId === seed.id}
                                disabled={alreadyAdded}
                                note={alreadyAdded ? 'Already added — one per project' : undefined}
                                onSelect={() => onSeedChange?.(seed.id)}
                            />
                        );
                    })}
                </div>
            ) : null}
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
