/**
 * Project Status Utilities
 *
 * Shared utility functions for displaying project status information.
 * Extracted from ProjectCard, ProjectRow, ProjectListView, and ProjectButton
 * to eliminate code duplication.
 */

import type { Project, ProjectStatus } from '@/types/base';
import { getComponentInstanceValues } from '@/types/typeGuards';

/**
 * StatusDot variant type for visual status indication
 */
export type StatusVariant = 'success' | 'neutral' | 'warning' | 'error';

/**
 * Gets the human-readable display text for a project status
 *
 * @param status - The project status
 * @param port - Optional port number for running projects
 * @param isEds - Whether the project is an EDS project
 * @returns Human-readable status text
 */
export function getStatusText(status: ProjectStatus, port?: number, isEds?: boolean): string {
    // EDS projects show "Published" unless they're in a transitional state
    if (isEds) {
        if (status === 'resetting') {
            return 'Resetting...';
        }
        if (status === 'republishing') {
            return 'Republishing...';
        }
        return 'Published';
    }

    switch (status) {
        case 'running':
            return port ? `Running on port ${port}` : 'Running';
        case 'starting':
            return 'Starting...';
        case 'stopping':
            return 'Stopping...';
        case 'resetting':
            return 'Resetting...';
        case 'republishing':
            return 'Republishing...';
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
 * @param isEds - Whether the project is an EDS project
 * @returns StatusDot variant for color coding
 */
export function getStatusVariant(status: ProjectStatus, isEds?: boolean): StatusVariant {
    // EDS projects show "success" (green) unless they're in a transitional state
    if (isEds) {
        if (status === 'resetting' || status === 'republishing') {
            return 'warning'; // Yellow/orange during transitional operations
        }
        return 'success';
    }

    switch (status) {
        case 'running':
            return 'success';
        case 'starting':
        case 'stopping':
        case 'resetting':
        case 'republishing':
            return 'warning';
        case 'error':
            return 'error';
        default:
            return 'neutral';
    }
}

/**
 * Gets the mesh status display text for a project card
 *
 * @returns Display text or null if no mesh status to show
 */
export function getMeshStatusText(project: Project): string | null {
    switch (project.meshStatusSummary) {
        case 'deployed':
            return 'Mesh Deployed';
        case 'stale':
        case 'update-declined':
            return 'Redeploy Mesh';
        case 'config-incomplete':
            return 'Mesh Incomplete';
        case 'error':
            return 'Mesh Error';
        case 'not-deployed':
        case 'unknown':
        case undefined:
            return null;
        default:
            return null;
    }
}

/**
 * Gets the StatusDot variant for mesh status display
 *
 * @returns StatusDot variant or null if no mesh status to show
 */
export function getMeshStatusVariant(project: Project): StatusVariant | null {
    switch (project.meshStatusSummary) {
        case 'deployed':
            return 'success';
        case 'stale':
        case 'config-incomplete':
        case 'update-declined':
            return 'warning';
        case 'error':
            return 'error';
        case 'not-deployed':
        case 'unknown':
        case undefined:
            return null;
        default:
            return null;
    }
}

/**
 * Gets the frontend port from a running project
 *
 * Searches component instances for the first one with a port defined.
 * Returns undefined if project is not running or has no components with ports.
 *
 * SOP §4: Uses getComponentInstanceValues() helper instead of inline Object.values()
 *
 * @param project - The project to get the port from
 * @returns The frontend port number, or undefined if not available
 */
export function getFrontendPort(project: Project): number | undefined {
    if (project.status !== 'running' || !project.componentInstances) {
        return undefined;
    }
    const instances = getComponentInstanceValues(project);
    const frontend = instances.find((c) => c.port !== undefined);
    return frontend?.port;
}
