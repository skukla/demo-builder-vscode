/**
 * ProjectBuilderRail Component (Slice 2 — Step 4)
 *
 * The single-select LEFT rail of the two-column Project Builder step. Renders
 * one selectable row per {@link BuilderArea} using the dashboard subtle-primitive
 * convention ({@link StatusCard}): the area label + its status summary, plus a
 * required/optional tag when the area declares one. Not-ready (stack-gated) rows
 * render greyed and disabled — they cannot be selected until a stack is chosen
 * (the ready flag is computed upstream by buildBuilderAreas). The active row is
 * visually highlighted.
 *
 * Pure presentational: no local state, no data fetching. Selection flows out
 * through `onSelectArea`; the step owns the active-area state.
 *
 * @module features/project-creation/ui/builder/ProjectBuilderRail
 */

import React from 'react';
import { StatusCard } from '@/core/ui/components/feedback';
import { cn } from '@/core/ui/utils/classNames';
import type {
    BuilderArea,
    BuilderAreaId,
} from '@/features/project-creation/ui/builder/projectBuilderAreas';

export interface ProjectBuilderRailProps {
    /** Ordered area descriptors to render (from buildBuilderAreas). */
    areas: BuilderArea[];
    /** The currently-active area id (its row is highlighted). */
    activeAreaId: BuilderAreaId;
    /** Invoked with an area id when a ready row is selected. */
    onSelectArea: (id: BuilderAreaId) => void;
}

/** Map an area's ready/active state to the StatusCard dot color. */
function rowColor(isReady: boolean, isActive: boolean): 'gray' | 'green' | 'blue' {
    if (!isReady) return 'gray';
    return isActive ? 'blue' : 'green';
}

/** One rail row: a button wrapping a StatusCard + the requirement tag. */
function ProjectBuilderRailRow({
    area,
    isActive,
    onSelectArea,
}: {
    area: BuilderArea;
    isActive: boolean;
    onSelectArea: (id: BuilderAreaId) => void;
}) {
    return (
        <button
            type="button"
            data-area-id={area.id}
            aria-current={isActive ? 'true' : undefined}
            disabled={!area.ready}
            onClick={() => onSelectArea(area.id)}
            className={cn(
                'project-builder-rail-row',
                isActive && 'active',
                !area.ready && 'disabled',
            )}
        >
            <StatusCard
                label={area.label}
                status={area.summary}
                color={rowColor(area.ready, isActive)}
                size="S"
            />
            {area.requirement && (
                <span className={cn('project-builder-rail-tag', area.requirement)}>
                    {area.requirement === 'required' ? 'Required' : 'Optional'}
                </span>
            )}
        </button>
    );
}

/**
 * Render the single-select Project Builder rail.
 *
 * @param props - Areas to render, the active area id, and the select callback
 * @returns The rail list of area rows
 */
export const ProjectBuilderRail: React.FC<ProjectBuilderRailProps> = ({
    areas,
    activeAreaId,
    onSelectArea,
}) => (
    <div className="project-builder-rail" role="list">
        {areas.map(area => (
            <ProjectBuilderRailRow
                key={area.id}
                area={area}
                isActive={area.id === activeAreaId}
                onSelectArea={onSelectArea}
            />
        ))}
    </div>
);
