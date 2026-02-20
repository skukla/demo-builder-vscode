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
import React, { useCallback, useMemo } from 'react';
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
import { isEdsProject } from '@/types/typeGuards';
import { ProjectActionsMenu } from './ProjectActionsMenu';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import type { Project } from '@/types/base';

export interface ProjectCardProps {
    /** The project to display */
    project: Project;
    /** Whether the project demo is currently running */
    isRunning?: boolean;
    /** Callback when the card is selected */
    onSelect: (project: Project) => void;
    /** Callback to start the demo */
    onStartDemo?: (project: Project) => void;
    /** Callback to stop the demo */
    onStopDemo?: (project: Project) => void;
    /** Callback to open the demo in browser (for non-EDS projects) */
    onOpenBrowser?: (project: Project) => void;
    /** Callback to open the live site (for EDS projects) */
    onOpenLiveSite?: (project: Project) => void;
    /** Callback to open DA.live for authoring (for EDS projects) */
    onOpenDaLive?: (project: Project) => void;
    /** Callback to reset project (re-clone components or reset from template) */
    onResetProject?: (project: Project) => void;
    /** Callback to republish content to CDN (for EDS projects) */
    onRepublishContent?: (project: Project) => void;
    /** Callback to edit project settings */
    onEdit?: (project: Project) => void;
    /** Callback to rename project */
    onRename?: (project: Project) => void;
    /** Callback to export project settings */
    onExport?: (project: Project) => void;
    /** Callback to delete project */
    onDelete?: (project: Project) => void;
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
    onStartDemo,
    onStopDemo,
    onOpenBrowser,
    onOpenLiveSite,
    onOpenDaLive,
    onResetProject,
    onRepublishContent,
    onEdit,
    onRename,
    onExport,
    onDelete,
}) => {
    const handleClick = useCallback(() => {
        onSelect(project);
    }, [project, onSelect]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(project);
            }
        },
        [project, onSelect],
    );

    const isEds = isEdsProject(project);
    const port = getFrontendPort(project);
    // EDS projects use storefront status; non-EDS use demo running status
    const statusText = isEds ? getStorefrontStatusText(project) : getStatusText(project.status, port, false);
    const statusVariant = isEds ? getStorefrontStatusVariant(project) : getStatusVariant(project.status, false);
    const brandStackSummary = useMemo(() => getBrandStackSummary(project), [project]);
    const meshText = getMeshStatusText(project);
    const meshVariant = getMeshStatusVariant(project);

    const ariaLabel = `${project.name}, ${statusText}${brandStackSummary ? `, ${brandStackSummary}` : ''}`;

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={ariaLabel}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className="project-card-spectrum"
        >
            {/* Header Row: Name + More Menu */}
            <Flex alignItems="center" justifyContent="space-between">
                <Text UNSAFE_className="project-card-spectrum-name">
                    {project.name}
                </Text>
                <ProjectActionsMenu
                    project={project}
                    isRunning={isRunning}
                    onStartDemo={onStartDemo}
                    onStopDemo={onStopDemo}
                    onOpenBrowser={onOpenBrowser}
                    onOpenLiveSite={onOpenLiveSite}
                    onOpenDaLive={onOpenDaLive}
                    onResetProject={onResetProject}
                    onRepublishContent={onRepublishContent}
                    onEdit={onEdit}
                    onRename={onRename}
                    onExport={onExport}
                    onDelete={onDelete}
                    className="project-card-menu-button"
                />
            </Flex>

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
