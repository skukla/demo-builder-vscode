/**
 * Project Status Utilities
 *
 * Shared utility functions for displaying project status information.
 * Extracted from ProjectCard, ProjectRow, ProjectListView, and ProjectButton
 * to eliminate code duplication.
 */

import type { Project, ProjectStatus } from '@/types/base';

/**
 * StatusDot variant type for visual status indication
 */
export type StatusVariant = 'success' | 'neutral' | 'warning' | 'error';

/**
 * Gets the human-readable display text for a project status
 *
 * @param status - The project status
 * @param port - Optional port number for running projects
 * @returns Human-readable status text
 */
export function getStatusText(status: ProjectStatus, port?: number): string {
    switch (status) {
        case 'running':
            return port ? `Running on port ${port}` : 'Running';
        case 'starting':
            return 'Starting...';
        case 'stopping':
            return 'Stopping...';
        case 'stopped':
        case 'ready':
            return 'Stopped';
        case 'error':
            return 'Error';
        default:
            return 'Stopped';
    }
}

/**
 * Gets the StatusDot variant for visual status indication
 *
 * @param status - The project status
 * @returns StatusDot variant for color coding
 */
export function getStatusVariant(status: ProjectStatus): StatusVariant {
    switch (status) {
        case 'running':
            return 'success';
        case 'starting':
        case 'stopping':
            return 'warning';
        case 'error':
            return 'error';
        default:
            return 'neutral';
    }
}

/**
 * Gets the frontend port from a running project
 *
 * Searches component instances for the first one with a port defined.
 * Returns undefined if project is not running or has no components with ports.
 *
 * @param project - The project to get the port from
 * @returns The frontend port number, or undefined if not available
 */
export function getFrontendPort(project: Project): number | undefined {
    if (project.status !== 'running' || !project.componentInstances) {
        return undefined;
    }
    const frontend = Object.values(project.componentInstances).find(
        (c) => c.port !== undefined,
    );
    return frontend?.port;
}
