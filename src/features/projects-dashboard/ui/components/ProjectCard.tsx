/**
 * ProjectCard Component
 *
 * Displays a single project as a clickable card with Spectrum styling.
 * Uses gray-50/gray-75 layered backgrounds matching the project wizard.
 * Changes colour on hover, with no movement (owner, 2026-11-05), and has uppercase status text.
 * Shows installed components as a text list.
 * Includes a kebab menu for additional actions like Export.
 */

import { Flex, Text } from '@adobe/react-spectrum';
import React, { useCallback, useMemo, useState } from 'react';
import { useProjectSelectHandlers } from '../hooks/useProjectSelectHandlers';
import type { ProjectActions } from './ProjectActionsMenu';
import { ProjectSelectBox, type TileSelection } from './ProjectSelectBox';
import { ProjectTileName, ProjectTileTools } from './ProjectTileTools';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import { getBrandStackSummary } from '@/features/projects-dashboard/utils/componentSummaryUtils';
import {
    getRuntimeSummary,
    getDeploymentSummary,
} from '@/features/projects-dashboard/utils/projectStatusUtils';
import type { Project } from '@/types/base';

export interface ProjectCardProps {
    /** The project to display */
    project: Project;
    /** Whether the project demo is currently running */
    isRunning?: boolean;
    /**
     * Callback when the card is selected. The optional `opts` carries modifier
     * intent — `forceNewWindow: true` indicates the user wants to open the
     * project in a new VS Code window (shift-click or cmd-click convention).
     */
    onSelect: (project: Project, opts?: { forceNewWindow?: boolean }) => void;
    /** Bundled action callbacks for the kebab menu */
    actions?: ProjectActions;
    /**
     * While the list is selecting: the card shows a box, a click ticks it rather than opening the
     * project, and the menu, the pin and rename are hidden (owner, 2026-11-04).
     */
    selection?: TileSelection;
}

/**
 * ProjectCard - Displays a project as a clickable card with Spectrum styling
 *
 * Layout: Gray-50 base with gray-75 hover and uppercase status
 */
export function ProjectCard({
    project,
    isRunning = false,
    onSelect,
    actions = {},
    selection,
}: ProjectCardProps) {
    const [renameRequest, setRenameRequest] = useState(0);
    const askRename = useCallback((): void => setRenameRequest((count) => count + 1), []);
    const { handleClick, handleKeyDown } = useProjectSelectHandlers(project, onSelect, selection?.onToggle);

    const brandStackSummary = useMemo(() => getBrandStackSummary(project), [project]);
    // Two axes, one line each. Runtime is the LOCAL dev server, so EDS projects —
    // which have no running state — get that line only while an operation is in
    // flight. Deployment is the cloud side: the card used to name the mesh and
    // count integrations while saying nothing about the storefront, which drifts
    // the same way. Per-component detail lives on the integrations dashboard, one
    // click away; the card answers "is what is deployed current?".
    const runtime = getRuntimeSummary(project);
    const deployment = getDeploymentSummary(project);

    // Both status lines reach the label, because either may be absent: an EDS
    // project at rest has no runtime line, and a project with nothing deployed has
    // no deployment line. Joining what exists keeps the spoken label matching the
    // visible card instead of hard-coding a slot that may be empty.
    const ariaLabel = [
        getProjectDisplayName(project),
        runtime?.text,
        deployment?.text,
        brandStackSummary,
    ]
        .filter(Boolean)
        .join(', ');

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={ariaLabel}
            aria-pressed={selection ? selection.selected : undefined}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className="project-card-spectrum"
        >
            {/* Header Row: Name, then the pin and the More Menu. The pin is a button
                beside the menu (owner, 2026-10-28): it was a menu row. */}
            <Flex alignItems="center" justifyContent="space-between" gap="size-100">
                <Flex alignItems="center" gap="size-75" minWidth={0}>
                    {selection && <ProjectSelectBox project={project} selection={selection} />}
                    <ProjectTileName
                        project={project}
                        isRunning={isRunning}
                        actions={actions}
                        textClassName="project-card-spectrum-name"
                        editRequest={renameRequest}
                        selecting={Boolean(selection)}
                    />
                </Flex>
                {!selection && (
                    <Flex alignItems="center" gap="size-50">
                        <ProjectTileTools project={project} isRunning={isRunning} actions={actions} onRename={askRename} />
                    </Flex>
                )}
            </Flex>

            {/* Brand & Stack Summary */}
            {brandStackSummary && (
                <Text UNSAFE_className="project-card-spectrum-components">{brandStackSummary}</Text>
            )}

            {/* Status rows, read TOP-DOWN from directly beneath the stack summary:
                runtime, then deployment.

                No `marginTop="auto"` here. In this flex column that pushed the row
                — and every status row after it — to the card's BOTTOM edge, so the
                first status sat at a different height depending on how many
                followed it. Order was always runtime-first; the POSITION moved,
                which is what read as inconsistent across a grid of cards. Anchored
                to the top, the first status lands in the same place on every card
                and the slack falls below. */}
            {runtime && (
                <Flex alignItems="center" gap="size-100">
                    <StatusDot variant={runtime.variant} size={6} />
                    <Text UNSAFE_className="project-card-spectrum-status">{runtime.text}</Text>
                </Flex>
            )}

            {/* Deployment Status Row — mesh + storefront + integrations, worst-of; "Needs
                reset" when the storefront is behind, in place of "Deployed". */}
            {deployment && (
                <span title={deployment.explanation} data-testid="project-deployment-status">
                    <Flex alignItems="center" gap="size-100">
                        <StatusDot variant={deployment.variant} size={6} />
                        <Text UNSAFE_className="project-card-spectrum-status">{deployment.text}</Text>
                    </Flex>
                </span>
            )}

        </div>
    );
}
