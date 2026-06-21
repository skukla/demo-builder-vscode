/**
 * ProjectBuilderDetail Component (Slice 2 — Step 5)
 *
 * The RIGHT pane of the Project Builder step: a switch over the active rail area
 * that renders the existing presentational panel for that area
 * (Architecture / App Builder Components / Block Libraries). All data + handlers
 * are passed in by {@link ProjectBuilderStep}, replicating the exact wiring the
 * ArchitectureModal used — this helper only chooses WHICH panel to show.
 *
 * Extracted from ProjectBuilderStep so the step stays under the size SOP.
 *
 * @module features/project-creation/ui/builder/ProjectBuilderDetail
 */

import React from 'react';
import type { BuilderAreaId } from '@/features/project-creation/ui/builder/projectBuilderAreas';
import {
    AppBuilderComponentsStepContent,
    type AppBuilderComponentsStepContentProps,
} from '@/features/project-creation/ui/components/AppBuilderComponentsStepContent';
import {
    ArchitectureStepContent,
    type ArchitectureStepContentProps,
} from '@/features/project-creation/ui/components/ArchitectureStepContent';
import {
    BlockLibrariesStepContent,
    type BlockLibrariesStepContentProps,
} from '@/features/project-creation/ui/components/BlockLibrariesStepContent';

export interface ProjectBuilderDetailProps {
    /** Which area's panel to render. */
    activeAreaId: BuilderAreaId;
    /** Props for the Architecture panel. */
    architecture: ArchitectureStepContentProps;
    /** Props for the App Builder Components panel. */
    appBuilderComponents: AppBuilderComponentsStepContentProps;
    /** Props for the Block Libraries panel (EDS only). */
    blockLibraries: BlockLibrariesStepContentProps;
}

/**
 * Render the active area's panel in the right pane.
 *
 * @param props - The active area id plus per-panel prop bundles
 * @returns The selected panel element
 */
export const ProjectBuilderDetail: React.FC<ProjectBuilderDetailProps> = ({
    activeAreaId,
    architecture,
    appBuilderComponents,
    blockLibraries,
}) => {
    switch (activeAreaId) {
        case 'app-builder-components':
            return <AppBuilderComponentsStepContent {...appBuilderComponents} />;
        case 'block-libraries':
            return <BlockLibrariesStepContent {...blockLibraries} />;
        case 'architecture':
        default:
            return <ArchitectureStepContent {...architecture} />;
    }
};
