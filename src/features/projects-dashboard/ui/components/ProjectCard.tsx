/**
 * ProjectCard Component
 *
 * Displays a single project as a clickable card with Spectrum styling.
 * Uses gray-50/gray-75 layered backgrounds matching the project wizard.
 * Features lift animation on hover and uppercase status text.
 * Shows installed components as a text list.
 * Includes a kebab menu for additional actions like Export.
 */

import { Flex, Text } from '@adobe/react-spectrum';
import PinOn from '@spectrum-icons/workflow/PinOn';
import React, { useMemo } from 'react';
import { useProjectSelectHandlers } from '../hooks/useProjectSelectHandlers';
import { ProjectActionsMenu, type ProjectActions } from './ProjectActionsMenu';
import { InlineRenameField } from '@/core/ui/components/forms/InlineRenameField';
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
}

/**
 * ProjectCard - Displays a project as a clickable card with Spectrum styling
 *
 * Layout: Gray-50 base with gray-75 hover, lift animation, and uppercase status
 */
export function ProjectCard({
    project,
    isRunning = false,
    onSelect,
    actions = {},
}: ProjectCardProps) {
    const { handleClick, handleKeyDown } = useProjectSelectHandlers(project, onSelect);

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
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className="project-card-spectrum"
        >
            {/* Header Row: Pin indicator (when pinned) + Name + More Menu */}
            <Flex alignItems="center" justifyContent="space-between" gap="size-100">
                <Flex alignItems="center" gap="size-75" minWidth={0}>
                    {project.pinned && (
                        <span
                            data-testid="project-card-pin-indicator"
                            aria-label="Pinned"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                flex: '0 0 auto',
                                color: 'var(--spectrum-global-color-gray-700)',
                            }}
                        >
                            <PinOn size="XS" />
                        </span>
                    )}
                    {/* Rename-in-place: the pencil (hover-revealed) swaps the name
                        for an input; hidden while running (backend rejects) or
                        when the rename callback isn't wired. */}
                    <InlineRenameField
                        name={getProjectDisplayName(project)}
                        textClassName="project-card-spectrum-name"
                        disabled={isRunning || !actions.onRenameSubmit}
                        // No `normalize`: the field takes the TITLE as typed.
                        // `renameProjectCore` derives the slug from it and moves
                        // the folder to match, so rewriting keystrokes to hyphens
                        // here would only put the enforcement back in the one
                        // place the user has to look at.
                        onRename={(newName) =>
                            actions.onRenameSubmit
                                ? actions.onRenameSubmit(project, newName)
                                : Promise.resolve(null)
                        }
                    />
                </Flex>
                <ProjectActionsMenu
                    project={project}
                    isRunning={isRunning}
                    actions={actions}
                    className="project-card-menu-button"
                />
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

            {/* Deployment Status Row — mesh + storefront + integrations, worst-of */}
            {deployment && (
                <Flex alignItems="center" gap="size-100">
                    <StatusDot variant={deployment.variant} size={6} />
                    <Text UNSAFE_className="project-card-spectrum-status">{deployment.text}</Text>
                </Flex>
            )}
        </div>
    );
}
