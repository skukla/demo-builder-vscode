/**
 * Type Guards
 *
 * Provides runtime type checking functions for type-safe operations.
 * Used when receiving data from external sources (webview, JSON, CLI output).
 */

import {
    Project,
    ComponentInstance,
} from './index';

/**
 * isRecord - Type guard for Record<string, unknown>
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * isStringArray - Type guard for string[]
 */
export function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(item => typeof item === 'string');
}

/**
 * hasProperty - Type guard to check if object has property
 */
export function hasProperty<K extends string>(
    obj: unknown,
    key: K,
): obj is Record<K, unknown> {
    return isRecord(obj) && key in obj;
}

/**
 * parseJSON - Safe JSON parsing with type guard
 */
export function parseJSON<T = unknown>(
    json: string,
    guard?: (value: unknown) => value is T,
): T | null {
    try {
        const parsed = JSON.parse(json); // OK: parseJSON implementation uses JSON.parse internally
        if (guard && !guard(parsed)) {
            return null;
        }
        return parsed as T;
    } catch {
        return null;
    }
}

/**
 * isError - Type guard for Error
 */
export function isError(value: unknown): value is Error {
    return value instanceof Error;
}

/**
 * toError - Convert unknown error to Error
 */
export function toError(error: unknown): Error {
    if (isError(error)) {
        return error;
    }
    if (typeof error === 'string') {
        return new Error(error);
    }
    if (isRecord(error) && typeof error.message === 'string') {
        return new Error(error.message);
    }
    return new Error('Unknown error occurred');
}

// =============================================================================
// Object Utility Functions
// =============================================================================
// These extract common inline Object.keys/values/entries patterns
// per SOP code-patterns.md §4 (Inline Object Operations)

/**
 * Check if object has any entries (type guard)
 *
 * Replaces inline: `Object.keys(obj).length > 0`
 * Acts as a type guard to narrow out null/undefined.
 *
 * @param obj - Object to check (can be undefined/null)
 * @returns true if object has at least one enumerable property
 */
export function hasEntries<T extends Record<string, unknown>>(
    obj: T | undefined | null,
): obj is T {
    if (!obj) return false;
    return Object.keys(obj).length > 0;
}

/**
 * Get count of entries in object
 *
 * Replaces inline: `Object.keys(obj).length`
 *
 * @param obj - Object to count (can be undefined/null)
 * @returns Number of enumerable properties, 0 if null/undefined
 */
export function getEntryCount(obj: Record<string, unknown> | undefined | null): number {
    if (!obj) return 0;
    return Object.keys(obj).length;
}

// =============================================================================
// Project Accessor Functions
// =============================================================================
// These extract common deep optional chain patterns from project data
// per SOP code-patterns.md §4 (Deep Optional Chaining)

/**
 * Get frontend component port from project
 *
 * Finds frontend component dynamically by type (not hardcoded ID)
 * SOP §4: Extracted deep optional chain to named getter
 *
 * @param project - Project to extract port from (can be undefined/null)
 * @returns Port number if available, undefined otherwise
 */
export function getProjectFrontendPort(project: Project | undefined | null): number | undefined {
    const frontendComponent = getComponentInstancesByType(project, 'frontend')[0];
    return frontendComponent?.port;
}

/**
 * Get component IDs from component instances record
 *
 * Replaces inline: `Object.keys(componentInstances || {})`
 * SOP §4: Extracted inline object operation to named helper
 *
 * @param componentInstances - Component instances record (can be undefined/null)
 * @returns Array of component IDs, empty array if null/undefined
 */
export function getComponentIds(
    componentInstances: Record<string, ComponentInstance> | undefined | null,
): string[] {
    if (!componentInstances) return [];
    return Object.keys(componentInstances);
}

/**
 * Get component instance entries from project
 *
 * Replaces inline: `Object.entries(project.componentInstances || {})`
 * SOP §4: Extracted inline object operation to named helper
 *
 * @param project - Project to extract entries from
 * @returns Array of [id, instance] tuples
 */
export function getComponentInstanceEntries(
    project: Project | undefined | null,
): Array<[string, ComponentInstance]> {
    if (!project?.componentInstances) return [];
    return Object.entries(project.componentInstances);
}

/**
 * Get component instance values from project
 *
 * Replaces inline: `Object.values(project.componentInstances || {})`
 * SOP §4: Extracted inline object operation to named helper
 *
 * @param project - Project to extract values from
 * @returns Array of ComponentInstance
 */
export function getComponentInstanceValues(
    project: Project | undefined | null,
): ComponentInstance[] {
    if (!project?.componentInstances) return [];
    return Object.values(project.componentInstances);
}

/**
 * Get component instances by type
 *
 * Replaces inline: `Object.values(componentInstances).filter(c => c.type === type)`
 * SOP §4: Extracted inline object operation with filter to named helper
 *
 * @param project - Project to search
 * @param type - Component type to filter by (returns empty if undefined)
 * @returns Array of matching ComponentInstance
 */
export function getComponentInstancesByType(
    project: Project | undefined | null,
    type: string | undefined,
): ComponentInstance[] {
    if (!project?.componentInstances || type === undefined) return [];
    return Object.values(project.componentInstances).filter(c => c.type === type);
}

/**
 * Get the installed version of a component from a project
 *
 * Replaces inline: `project?.componentVersions?.[componentId]?.version`
 * SOP §4: Extracted deep optional chain to named getter
 *
 * @param project - The project to check (can be undefined/null)
 * @param componentId - The component ID to look up
 * @returns The version string or undefined if not found
 */
export function getComponentVersion(
    project: Project | undefined | null,
    componentId: string,
): string | undefined {
    return project?.componentVersions?.[componentId]?.version;
}

/**
 * Get the PORT configuration for a component
 *
 * Replaces inline: `componentConfigs?.[componentId]?.PORT`
 * SOP §4: Extracted deep optional chain to named getter
 *
 * @param componentConfigs - The component configs object (can be undefined)
 * @param componentId - The component ID to look up
 * @returns The port number or undefined if not found
 */
export function getComponentConfigPort(
    componentConfigs: Record<string, unknown> | undefined,
    componentId: string,
): number | undefined {
    const config = componentConfigs?.[componentId] as { PORT?: number } | undefined;
    return config?.PORT;
}

// =============================================================================
// Authentication Predicate Functions
// =============================================================================
// SOP §4/§10: Extracted boolean coercion and validation chain helpers

/**
 * Check if organization has a valid name
 *
 * SOP §4: Extracted `!!state.adobeOrg?.name` boolean coercion
 *
 * @param org - Adobe organization object (can be undefined/null)
 * @returns true if organization has a non-empty name
 */
export function hasOrganizationName(org: { name?: string } | undefined | null): boolean {
    return !!org?.name;
}

/**
 * Check if user can proceed from authentication step
 *
 * SOP §10: Extracted 3-condition validation chain from useAuthStatus.ts
 *
 * @param isAuthenticated - Whether user is authenticated
 * @param org - Adobe organization with name
 * @param tokenExpiringSoon - Whether token is expiring soon
 * @returns true if user can proceed
 */
export function canProceedFromAuth(
    isAuthenticated: boolean,
    org: { name?: string } | undefined | null,
    tokenExpiringSoon: boolean | undefined,
): boolean {
    if (!isAuthenticated) return false;
    if (!hasOrganizationName(org)) return false;
    if (tokenExpiringSoon) return false;
    return true;
}

// =============================================================================
// EDS (Edge Delivery Services) Project Functions
// =============================================================================
// SOP §4: Centralized EDS detection for use across features
// Used by: projects-dashboard, dashboard, project-creation

/**
 * Check if a stack ID represents an EDS (Edge Delivery Services) stack
 *
 * EDS stacks use static site hosting and don't have start/stop functionality.
 * This is the low-level check used by isEdsProject and executor.
 *
 * @param stackId - The stack ID to check (e.g., 'eds-dalive', 'headless')
 * @returns true if the stack ID starts with 'eds-'
 */
export function isEdsStackId(stackId: string | undefined | null): boolean {
    return stackId?.startsWith('eds-') ?? false;
}

/**
 * Check if a project is an EDS (Edge Delivery Services) project
 *
 * EDS projects use static site hosting and don't have start/stop functionality.
 * They are always "live" once deployed.
 *
 * SOP §4: Extracted stack detection to named predicate for cross-feature use
 *
 * @param project - The project to check (can be undefined/null)
 * @returns true if the project is an EDS project
 */
export function isEdsProject(project: Project | undefined | null): boolean {
    return isEdsStackId(project?.selectedStack);
}

/**
 * Get the live URL for an EDS project
 *
 * The live URL is stored in the 'eds' component instance metadata.
 *
 * SOP §4: Extracted deep optional chain to named getter
 *
 * @param project - The EDS project (can be undefined/null)
 * @returns The live URL, or undefined if not available
 */
export function getEdsLiveUrl(project: Project | undefined | null): string | undefined {
    if (!isEdsProject(project)) return undefined;
    const edsInstance = project?.componentInstances?.['eds'];
    return edsInstance?.metadata?.liveUrl as string | undefined;
}

/**
 * Get the preview URL for an EDS project
 *
 * The preview URL is stored in the 'eds' component instance metadata.
 *
 * SOP §4: Extracted deep optional chain to named getter
 *
 * @param project - The EDS project (can be undefined/null)
 * @returns The preview URL, or undefined if not available
 */
export function getEdsPreviewUrl(project: Project | undefined | null): string | undefined {
    if (!isEdsProject(project)) return undefined;
    const edsInstance = project?.componentInstances?.['eds'];
    return edsInstance?.metadata?.previewUrl as string | undefined;
}


/**
 * Get the DA.live authoring URL for an EDS project
 *
 * Constructs the URL from DA.live org and site stored in 'eds' component instance metadata.
 *
 * @param project - The EDS project (can be undefined/null)
 * @returns The DA.live authoring URL (e.g., https://da.live/#/org/site), or undefined if not available
 */
export function getEdsDaLiveUrl(project: Project | undefined | null): string | undefined {
    if (!isEdsProject(project)) return undefined;
    const edsInstance = project?.componentInstances?.['eds'];
    const daLiveOrg = edsInstance?.metadata?.daLiveOrg as string | undefined;
    const daLiveSite = edsInstance?.metadata?.daLiveSite as string | undefined;
    
    if (!daLiveOrg || !daLiveSite) return undefined;
    
    return `https://da.live/#/${daLiveOrg}/${daLiveSite}`;
}
