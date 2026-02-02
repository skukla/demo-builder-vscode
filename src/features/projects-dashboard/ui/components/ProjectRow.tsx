/**
 * ProjectRow Component
 *
 * Displays a project as a full-width horizontal row with Spectrum styling.
 * Shows project name, installed components, and status.
 * Includes a kebab menu for additional actions like Export.
 */

import { Flex, Text } from '@adobe/react-spectrum';
import ChevronRight from '@spectrum-icons/workflow/ChevronRight';
import React, { useCallback, useMemo } from 'react';
import { getComponentSummary } from '@/features/projects-dashboard/utils/componentSummaryUtils';
import {
    getStatusText,
    getStatusVariant,
    getFrontendPort,
    getStorefrontStatusText,
    getStorefrontStatusVariant,
} from '@/features/projects-dashboard/utils/projectStatusUtils';
import { isEdsProject } from '@/types/typeGuards';
import { ProjectActionsMenu } from './ProjectActionsMenu';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import type { Project } from '@/types/base';

export interface ProjectRowProps {
    /** The project to display */
    project: Project;
    /** Whether the project demo is currently running */
    isRunning?: boolean;
    /** Callback when the row is selected */
    onSelect: (project: Project) => void;
    /** Callback to start the demo */
    onStartDemo?: (project: Project) => void;
    /** Callback to stop the demo */
    onStopDemo?: (project: Project) => void;
    /** Callback to open the demo in browser */
    onOpenBrowser?: (project: Project) => void;
    /** Callback to open the live site (for EDS projects) */
    onOpenLiveSite?: (project: Project) => void;
    /** Callback to open DA.live for authoring (for EDS projects) */
    onOpenDaLive?: (project: Project) => void;
    /** Callback to reset EDS project from template (for EDS projects) */
    onResetEds?: (project: Project) => void;
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
 * ProjectRow - Displays a project as a clickable row with Spectrum styling
 */
export const ProjectRow: React.FC<ProjectRowProps> = ({
    project,
    isRunning = false,
    onSelect,
    onStartDemo,
    onStopDemo,
    onOpenBrowser,
    onOpenLiveSite,
    onOpenDaLive,
    onResetEds,
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
    const componentSummary = useMemo(() => getComponentSummary(project), [project]);

    const ariaLabel = `${project.name}, ${statusText}${componentSummary ? `, ${componentSummary}` : ''}`;

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={ariaLabel}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className="project-row"
        >
            <Flex alignItems="center" justifyContent="space-between" width="100%">
                {/* Left: Status dot + Name + Components */}
                <Flex alignItems="center" gap="size-150">
                    <StatusDot variant={statusVariant} size={8} />
                    <Text UNSAFE_className="project-row-name">
                        {project.name}
                    </Text>
                    {componentSummary && (
                        <Text UNSAFE_className="project-row-components">
                            {componentSummary}
                        </Text>
                    )}
                </Flex>

                {/* Right: More menu + Status text + Chevron */}
                <Flex alignItems="center" gap="size-150">
                    <ProjectActionsMenu
                        project={project}
                        isRunning={isRunning}
                        onStartDemo={onStartDemo}
                        onStopDemo={onStopDemo}
                        onOpenBrowser={onOpenBrowser}
                        onOpenLiveSite={onOpenLiveSite}
                        onOpenDaLive={onOpenDaLive}
                        onResetEds={onResetEds}
                        onRepublishContent={onRepublishContent}
                        onEdit={onEdit}
                        onRename={onRename}
                        onExport={onExport}
                        onDelete={onDelete}
                        className="project-row-menu-button"
                    />
                    <Text UNSAFE_className="project-row-status">
                        {statusText}
                    </Text>
                    <ChevronRight size="S" UNSAFE_className="project-row-chevron" />
                </Flex>
            </Flex>
        </div>
    );
};
