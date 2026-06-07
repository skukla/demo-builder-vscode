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
import React, { useCallback, useMemo } from 'react';
import { ProjectActionsMenu, type ProjectActions } from './ProjectActionsMenu';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import { getBrandStackSummary } from '@/features/projects-dashboard/utils/componentSummaryUtils';
import {
    getStatusText,
    getStatusVariant,
    getFrontendPort,
    getMeshStatusText,
    getMeshStatusVariant,
    getStorefrontStatusText,
    getStorefrontStatusVariant,
} from '@/features/projects-dashboard/utils/projectStatusUtils';
import type { Project } from '@/types/base';
import { isEdsProject, getProjectArchetype } from '@/types/typeGuards';

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
export const ProjectCard: React.FC<ProjectCardProps> = ({
    project,
    isRunning = false,
    onSelect,
    actions = {},
}) => {
    const handleClick = useCallback(
        (e: React.MouseEvent) => {
            // Shift-click / Cmd-click → open in a new VS Code window (standard
            // VS Code modifier convention for Open Recent et al.).
            if (e.shiftKey || e.metaKey) {
                onSelect(project, { forceNewWindow: true });
            } else {
                onSelect(project);
            }
        },
        [project, onSelect],
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (e.shiftKey) {
                    onSelect(project, { forceNewWindow: true });
                } else {
                    onSelect(project);
                }
            }
        },
        [project, onSelect],
    );

    const isEds = isEdsProject(project);
    // A content-flow project is a repoless satellite joined to a shared upstream;
    // mark it "Shared" so it's distinguishable from a commerce storefront.
    const isContentFlow = getProjectArchetype(project).ownership === 'content';
    const upstreamLabel = project.upstream ? `${project.upstream.owner}/${project.upstream.repo}` : undefined;
    const port = getFrontendPort(project);
    // EDS projects use storefront status; non-EDS use demo running status
    const statusText = isEds ? getStorefrontStatusText(project) : getStatusText(project.status, port, false);
    const statusVariant = isEds ? getStorefrontStatusVariant(project) : getStatusVariant(project.status, false);
    const brandStackSummary = useMemo(() => getBrandStackSummary(project), [project]);
    const meshText = getMeshStatusText(project);
    const meshVariant = getMeshStatusVariant(project);

    const sharedSuffix = isContentFlow ? `, Shared${upstreamLabel ? ` from ${upstreamLabel}` : ''}` : '';
    const ariaLabel = `${project.name}, ${statusText}${brandStackSummary ? `, ${brandStackSummary}` : ''}${sharedSuffix}`;

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
                    <Text UNSAFE_className="project-card-spectrum-name">
                        {project.name}
                    </Text>
                </Flex>
                <ProjectActionsMenu
                    project={project}
                    isRunning={isRunning}
                    actions={actions}
                    className="project-card-menu-button"
                />
            </Flex>

            {/* Shared badge — content-flow (joined satellite) projects only */}
            {isContentFlow && (
                <Text
                    data-testid="project-card-shared-badge"
                    UNSAFE_className="project-card-spectrum-shared-badge"
                >
                    {upstreamLabel ? `Shared from ${upstreamLabel}` : 'Shared storefront'}
                </Text>
            )}

            {/* Brand & Stack Summary */}
            {brandStackSummary && (
                <Text UNSAFE_className="project-card-spectrum-components">
                    {brandStackSummary}
                </Text>
            )}

            {/* Status Row */}
            <Flex alignItems="center" gap="size-100" marginTop="auto">
                <StatusDot variant={statusVariant} size={6} />
                <Text UNSAFE_className="project-card-spectrum-status">
                    {statusText}
                </Text>
            </Flex>

            {/* Mesh Status Row */}
            {meshText && meshVariant && (
                <Flex alignItems="center" gap="size-100">
                    <StatusDot variant={meshVariant} size={6} />
                    <Text UNSAFE_className="project-card-spectrum-status">
                        {meshText}
                    </Text>
                </Flex>
            )}
        </div>
    );
};
