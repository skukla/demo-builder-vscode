/**
 * ProjectRow Component
 *
 * Displays a project as a full-width horizontal row with Spectrum styling.
 * Shows project name, installed components, and status.
 * Includes a kebab menu for additional actions like Export.
 */

import ChevronRight from '@spectrum-icons/workflow/ChevronRight';
import React, { useCallback, useMemo } from 'react';
import styles from '../styles/projects-dashboard.module.css';
import { ProjectActionsMenu } from './ProjectActionsMenu';
import { Flex, Text } from '@/core/ui/components/aria';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import { getComponentSummary } from '@/features/projects-dashboard/utils/componentSummaryUtils';
import {
    getStatusText,
    getStatusVariant,
    getFrontendPort,
} from '@/features/projects-dashboard/utils/projectStatusUtils';
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
    /** Callback to edit project settings */
    onEdit?: (project: Project) => void;
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
    onEdit,
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

    const port = getFrontendPort(project);
    const statusText = getStatusText(project.status, port);
    const statusVariant = getStatusVariant(project.status);
    const componentSummary = useMemo(() => getComponentSummary(project), [project]);

    const ariaLabel = `${project.name}, ${statusText}${componentSummary ? `, ${componentSummary}` : ''}`;

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={ariaLabel}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className={styles.projectRow}
        >
            <Flex alignItems="center" justifyContent="space-between" style={{ width: '100%' }}>
                {/* Left: Status dot + Name + Components */}
                <Flex alignItems="center" gap="size-150">
                    <StatusDot variant={statusVariant} size={8} />
                    <Text className={styles.projectRowName}>
                        {project.name}
                    </Text>
                    {componentSummary && (
                        <Text className={styles.projectRowComponents}>
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
                        onEdit={onEdit}
                        onExport={onExport}
                        onDelete={onDelete}
                        className={styles.projectRowMenuButton}
                    />
                    <Text className={styles.projectRowStatus}>
                        {statusText}
                    </Text>
                    <ChevronRight size="S" />
                </Flex>
            </Flex>
        </div>
    );
};
