/**
 * Create datapack's first screen: which kind of pack. Two cards; clicking one picks it, and
 * Continue goes on, as Add Integration's kind screen does (`KindStage`).
 *
 * A Commerce pack's line says where it goes, which depends on the engine (`datapackFlowStages`).
 *
 * @module features/data-installer/ui/components/create-flow/stages/PackTypeStage
 */

import React from 'react';
import { type DatapackEngine, type PackType } from '../datapackFlowStages';
import { ChoiceCard } from '@/features/project-creation/ui/components/ChoiceCard';

export interface PackTypeStageProps {
    engine?: DatapackEngine;
    packType?: PackType;
    onPick: (packType: PackType) => void;
}

const COMMERCE_LINE: Record<DatapackEngine, string> = {
    'demo-builder': "Save selected data from this store to this project's datapack.",
    service: 'Export data types from this store to the shared catalog.',
};

export function PackTypeStage({ engine = 'service', packType, onPick }: PackTypeStageProps): React.ReactElement {
    return (
        <div className="datapack-flow-cards">
            <ChoiceCard
                name="Commerce Datapack"
                description={COMMERCE_LINE[engine]}
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
