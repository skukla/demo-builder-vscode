/**
 * Create datapack's first screen: which kind of pack. Two cards; clicking one picks it, and
 * Continue goes on, as Add Integration's kind screen does (`KindStage`).
 *
 * A Commerce pack is saved from this store into the SC's own datapacks (`datapackFlowStages`).
 *
 * @module features/data-installer/ui/components/create-flow/stages/PackTypeStage
 */

import React from 'react';
import type { PackType } from '../datapackFlowStages';
import { ChoiceCard } from '@/features/project-creation/ui/components/ChoiceCard';

export interface PackTypeStageProps {
    packType?: PackType;
    onPick: (packType: PackType) => void;
}

export function PackTypeStage({ packType, onPick }: PackTypeStageProps): React.ReactElement {
    return (
        <div className="datapack-flow-cards">
            <ChoiceCard
                name="Commerce Datapack"
                description="Save selected data from this Commerce instance to a datapack of yours."
                selected={packType === 'commerce'}
                onSelect={() => onPick('commerce')}
            />
            <ChoiceCard
                name="ACO Datapack"
                description="Export catalog data for Adobe Commerce Optimizer as one of your datapacks."
                selected={packType === 'aco'}
                onSelect={() => onPick('aco')}
            />
        </div>
    );
}
