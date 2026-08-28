/**
 * BlankStage — the Build-custom source stage (`'source-blank'`).
 *
 * One required choice and one optional detail (owner design, 2026-08-27):
 * a "Start from" row of starting-point cards — "Blank" beside each SEED the
 * stack's catalog offers (the Commerce starter kit) — and beneath it the
 * shared {@link OptionalNameField}. Nothing here gates Continue: "Blank" is
 * the default pick and an empty name means "use the default label" (identity
 * is minted at commit with silent dedupe).
 *
 * Seed cards show the entry's REAL catalog description (clamped), never a
 * generated "Start from X and customize it" line that repeats the title. A
 * seed already in the project is disabled with the one-per-project note; the
 * add door's fixed-package gate stays authoritative for the cases this hint
 * cannot see.
 *
 * @module features/project-creation/ui/components/integration-flow/stages/BlankStage
 */

import React from 'react';
import { ChoiceCard } from '../../ChoiceCard';
import { BLANK_DEFAULT_LABEL } from '../flowStages';
import { OptionalNameField } from '../OptionalNameField';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

/** Keep seed descriptions to one card-sized thought. */
const SEED_DESCRIPTION_MAX = 110;

/** The Blank card's copy. */
export const BLANK_CARD_NAME = 'Blank';
export const BLANK_CARD_DESCRIPTION = 'An empty custom integration.';

function clampDescription(text: string): string {
    if (text.length <= SEED_DESCRIPTION_MAX) return text;
    return `${text.slice(0, SEED_DESCRIPTION_MAX).replace(/\s+\S*$/, '')}…`;
}

export interface BlankStageProps {
    /** Pre-built entries offered as starting points (empty = Blank only). */
    seeds?: AppBuilderComponentCatalogEntry[];
    /** The draft's picked seed id (undefined = Blank). */
    seedId?: string;
    /** Already-selected component ids — a seed whose id is among them is disabled. */
    selectedIds?: string[];
    /** Pick a seed (undefined returns to Blank). */
    onSeedChange?: (seedId: string | undefined) => void;
    /** The draft's raw typed label ('' / undefined = default). */
    label?: string;
    /** Report label keystrokes. */
    onLabelChange: (label: string) => void;
}

/**
 * The Build-custom source stage body.
 *
 * @param props - seeds, the picked seed, the optional label, and the callbacks
 * @returns the starting-point cards with the optional name beneath
 */
export function BlankStage({
    seeds = [],
    seedId,
    selectedIds = [],
    onSeedChange,
    label,
    onLabelChange,
}: BlankStageProps): React.ReactElement {
    const selectedSeed = seeds.find((seed) => seed.id === seedId);
    const defaultLabel = selectedSeed?.name ?? BLANK_DEFAULT_LABEL;
    return (
        <div className="intflow-blank">
            <div className="intflow-section-label">Start from</div>
            <div className="intflow-kind-choices">
                <ChoiceCard
                    name={BLANK_CARD_NAME}
                    description={BLANK_CARD_DESCRIPTION}
                    selected={seedId === undefined}
                    onSelect={() => onSeedChange?.(undefined)}
                />
                {seeds.map((seed) => {
                    const alreadyAdded = selectedIds.includes(seed.id);
                    return (
                        <ChoiceCard
                            key={seed.id}
                            name={seed.name}
                            description={clampDescription(seed.description)}
                            selected={seedId === seed.id}
                            disabled={alreadyAdded}
                            note={alreadyAdded ? 'Already added — one per project' : undefined}
                            onSelect={() => onSeedChange?.(seed.id)}
                        />
                    );
                })}
            </div>
            <OptionalNameField
                label={label}
                defaultLabel={defaultLabel}
                onLabelChange={onLabelChange}
            />
        </div>
    );
}
