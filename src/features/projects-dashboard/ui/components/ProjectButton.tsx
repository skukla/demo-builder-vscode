/**
 * ProjectButton Component
 *
 * Displays a project as a fixed-size button matching the Project Dashboard style.
 * 140px wide, 4:3 aspect ratio, centered Adobe icon.
 * Part of the layout prototype comparison.
 */

import { Flex, Text } from '@/core/ui/components/aria';
import React, { useCallback } from 'react';
import styles from '../styles/projects-dashboard.module.css';
import {
    getStatusText,
    getStatusVariant,
    getFrontendPort,
} from '@/features/projects-dashboard/utils/projectStatusUtils';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import type { Project } from '@/types/base';

/**
 * Adobe "A" icon - sized to match Spectrum size="L" icons (36px)
 */
const AdobeIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="36"
        height="33"
        viewBox="0 0 24 22"
        fill="currentColor"
        className={className}
    >
        <path d="M14.2353 21.6209L12.4925 16.7699H8.11657L11.7945 7.51237L17.3741 21.6209H24L15.1548 0.379395H8.90929L0 21.6209H14.2353Z" />
    </svg>
);

export interface ProjectButtonProps {
    /** The project to display */
    project: Project;
    /** Callback when the button is selected */
    onSelect: (project: Project) => void;
}

/**
 * Truncate project name if too long
 */
function truncateName(name: string, maxLength: number = 18): string {
    if (name.length <= maxLength) return name;
    return name.substring(0, maxLength - 1) + '…';
}

/**
 * ProjectButton - Displays a project as a clickable button (dashboard style)
 */
export const ProjectButton: React.FC<ProjectButtonProps> = ({
    project,
    onSelect,
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

    const isRunning = project.status === 'running';
    const port = getFrontendPort(project);
    const statusText = getStatusText(project.status, port);
    const statusVariant = getStatusVariant(project.status);
    const displayName = truncateName(project.name);

    const ariaLabel = `${project.name}, ${statusText}`;

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={ariaLabel}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className={styles.projectButton}
        >
            {/* Icon */}
            <AdobeIcon className={isRunning ? 'text-green-500' : 'text-gray-400'} />

            {/* Name */}
            <Text className={styles.projectButtonName}>
                {displayName}
            </Text>

            {/* Status */}
            <Flex alignItems="center" gap="size-50">
                <StatusDot variant={statusVariant} size={6} />
                <Text className={styles.projectButtonStatus}>
                    {statusText}
                </Text>
            </Flex>
        </div>
    );
};
