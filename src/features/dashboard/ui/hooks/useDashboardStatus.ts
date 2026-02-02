/**
 * useDashboardStatus Hook
 *
 * Extracts status state, subscriptions, and computed status displays
 * from ProjectDashboardScreen.
 *
 * @module features/dashboard/ui/hooks/useDashboardStatus
 */

import { useState, useEffect, useMemo, useRef, Dispatch, SetStateAction } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { getMeshStatusDisplay } from '@/core/ui/utils/meshStatusDisplay';

/**
 * Mesh deployment status values
 */
export type MeshStatus =
    | 'checking'
    | 'needs-auth'
    | 'authenticating'
    | 'not-deployed'
    | 'deploying'
    | 'deployed'
    | 'config-changed'
    | 'config-incomplete'
    | 'update-declined'
    | 'error';

/**
 * Project status data from extension
 */
export interface ProjectStatus {
    name: string;
    path: string;
    status: 'created' | 'configuring' | 'ready' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
    port?: number;
    adobeOrg?: string;
    adobeProject?: string;
    frontendConfigChanged?: boolean;
    mesh?: {
        status: MeshStatus;
        endpoint?: string;
        message?: string;
    };
    edsStorefrontStatus?: EdsStorefrontStatus;
}

/**
 * Status display color values
 */
export type StatusColor = 'blue' | 'green' | 'yellow' | 'orange' | 'red' | 'gray';

/**
 * Status display object
 */
export interface StatusDisplay {
    color: StatusColor;
    text: string;
}

/**
 * EDS storefront status values
 */
export type EdsStorefrontStatus = 'published' | 'stale' | 'update-declined' | 'not-published';

/**
 * Props for the useDashboardStatus hook
 */
export interface UseDashboardStatusProps {
    /** Whether project has mesh configuration */
    hasMesh?: boolean;
    /** Initial mesh status from card grid (avoids loading flash) */
    initialMeshStatus?: string;
    /** Initial EDS storefront status from initial data */
    initialEdsStorefrontStatus?: EdsStorefrontStatus;
}

/**
 * Return type for the useDashboardStatus hook
 */
export interface UseDashboardStatusReturn {
    /** Current project status data */
    projectStatus: ProjectStatus | null;
    /** Whether demo is currently running */
    isRunning: boolean;
    /** Whether UI is transitioning (button pressed, waiting for response) */
    isTransitioning: boolean;
    /** Setter for transitioning state */
    setIsTransitioning: Dispatch<SetStateAction<boolean>>;
    /** Computed demo status display */
    demoStatusDisplay: StatusDisplay;
    /** Computed mesh status display (null if no mesh) */
    meshStatusDisplay: StatusDisplay | null;
    /** Display name for project */
    displayName: string;
    /** Current project status value */
    status: ProjectStatus['status'] | undefined;
    /** Current mesh status value */
    meshStatus: MeshStatus | undefined;
}

/** Mesh statuses that indicate a user-initiated operation is in progress (preserve during updates) */
const isMeshDeploying = (status: MeshStatus | undefined): boolean =>
    status === 'deploying' || status === 'authenticating';

/** Mesh statuses that indicate any operation is in progress (disable UI actions) */
export const isMeshBusy = (status: MeshStatus | undefined): boolean =>
    status === 'deploying' || status === 'checking' || status === 'authenticating';

/**
 * Hook to manage dashboard status state and computed displays
 *
 * Extracts status management from ProjectDashboardScreen for better
 * separation of concerns and testability.
 *
 * @param props - Hook configuration
 * @returns Object containing status state and computed displays
 */
export function useDashboardStatus(props: UseDashboardStatusProps = {}, isEds = false): UseDashboardStatusReturn {
    const { hasMesh, initialMeshStatus, initialEdsStorefrontStatus } = props;

    const [projectStatus, setProjectStatus] = useState<ProjectStatus | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [isTransitioning, setIsTransitioning] = useState(false);
    // Track whether status was requested (prevent StrictMode double-request)
    const statusRequestedRef = useRef(false);

    useEffect(() => {
        // Guard against StrictMode double-request (only send message once)
        if (!statusRequestedRef.current) {
            statusRequestedRef.current = true;
            webviewClient.postMessage('requestStatus');
        }

        const unsubscribeStatus = webviewClient.onMessage('statusUpdate', (data: unknown) => {
            const projectData = data as ProjectStatus;
            // Merge status update, preserving mesh status only during active deployment
            // AND only if the new status is a transient 'checking' state.
            // This prevents update checks from resetting mesh button state mid-deployment
            // but allows completion statuses (deployed, error, etc.) to come through.
            setProjectStatus(prev => {
                const shouldPreserveMeshStatus =
                    isMeshDeploying(prev?.mesh?.status) && projectData.mesh?.status === 'checking';
                return {
                    ...projectData,
                    mesh: shouldPreserveMeshStatus ? prev?.mesh : projectData.mesh,
                };
            });
            setIsRunning(projectData.status === 'running');
            // Clear transitioning state when we receive a definitive status
            if (projectData.status === 'running' || projectData.status === 'ready' || projectData.status === 'stopped') {
                setIsTransitioning(false);
            }
        });

        const unsubscribeMesh = webviewClient.onMessage('meshStatusUpdate', (data: unknown) => {
            const meshData = data as { status: MeshStatus; message?: string; endpoint?: string };
            setProjectStatus(prev => prev ? {
                ...prev,
                mesh: {
                    status: meshData.status,
                    message: meshData.message,
                    endpoint: meshData.endpoint,
                },
            } : prev);
            // Clear transitioning state when mesh operation completes
            if (!isMeshBusy(meshData.status)) {
                setIsTransitioning(false);
            }
        });

        return () => {
            unsubscribeStatus();
            unsubscribeMesh();
        };
    }, []);

    // Derived values
    const status = projectStatus?.status;
    const port = projectStatus?.port || 3000;
    const frontendConfigChanged = projectStatus?.frontendConfigChanged || false;
    const meshStatus = projectStatus?.mesh?.status;
    const meshMessage = projectStatus?.mesh?.message;
    const displayName = projectStatus?.name || '';

    // Memoize status displays for performance
    const demoStatusDisplay = useMemo((): StatusDisplay => {
        // EDS projects show dynamic status based on storefront config state
        // Use updated value from projectStatus (via statusUpdate) or fall back to initial prop
        if (isEds) {
            const storefrontStatus = projectStatus?.edsStorefrontStatus || initialEdsStorefrontStatus || 'published';
            switch (storefrontStatus) {
                case 'published':
                    return { color: 'green', text: 'Published' };
                case 'stale':
                    return { color: 'yellow', text: 'Republish Needed' };
                case 'update-declined':
                    return { color: 'orange', text: 'Republish Needed' };
                case 'not-published':
                    return { color: 'gray', text: 'Not Published' };
                default:
                    return { color: 'green', text: 'Published' };
            }
        }

        switch (status) {
            case 'starting':
                return { color: 'blue', text: 'Starting...' };
            case 'running':
                if (frontendConfigChanged) {
                    return { color: 'yellow', text: 'Restart needed' };
                }
                return { color: 'green', text: `Running on port ${port}` };
            case 'stopping':
                return { color: 'yellow', text: 'Stopping...' };
            case 'stopped':
            case 'ready':
                return { color: 'gray', text: 'Stopped' };
            case 'configuring':
                return { color: 'blue', text: 'Configuring...' };
            case 'error':
                return { color: 'red', text: 'Error' };
            default:
                return { color: 'gray', text: 'Ready' };
        }
    }, [isEds, status, frontendConfigChanged, port, initialEdsStorefrontStatus, projectStatus?.edsStorefrontStatus]);

    const meshStatusDisplay = useMemo((): StatusDisplay | null => {
        // Use initialMeshStatus from init payload to avoid loading flash
        // Translate persisted values: 'stale' → 'config-changed' (dashboard terminology)
        const effectiveMeshStatus = meshStatus
            || (initialMeshStatus === 'stale' ? 'config-changed' : initialMeshStatus as MeshStatus | undefined);

        if (!effectiveMeshStatus) {
            // If we know hasMesh, use it
            if (hasMesh) return { color: 'blue', text: 'Loading status...' };
            // If projectStatus hasn't loaded yet, show loading (avoids flash)
            if (!projectStatus) return { color: 'blue', text: 'Loading status...' };
            // projectStatus loaded and no mesh - hide the section
            return null;
        }

        // Transient dashboard-only states (not persisted)
        switch (effectiveMeshStatus) {
            case 'checking':
                return { color: 'blue', text: 'Checking status...' };
            case 'needs-auth':
                return { color: 'yellow', text: 'Session expired' };
            case 'authenticating':
                return { color: 'blue', text: meshMessage || 'Signing in...' };
            case 'deploying':
                return { color: 'blue', text: meshMessage || 'Deploying...' };
        }

        // Persisted statuses — use shared display mapping
        // Dashboard uses 'config-changed' for what's stored as 'stale'
        const lookupKey = effectiveMeshStatus === 'config-changed' ? 'stale' : effectiveMeshStatus;
        const display = getMeshStatusDisplay(lookupKey);
        if (display) {
            return { color: display.color, text: display.text };
        }

        return { color: 'gray', text: 'Unknown' };
    }, [meshStatus, meshMessage, hasMesh, projectStatus, initialMeshStatus]);

    return {
        projectStatus,
        isRunning,
        isTransitioning,
        setIsTransitioning,
        demoStatusDisplay,
        meshStatusDisplay,
        displayName,
        status,
        meshStatus,
    };
}
