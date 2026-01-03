/**
 * useMeshStatus Hook
 *
 * Subscribes to mesh status updates from the extension and provides
 * formatted status display information.
 *
 * @module features/mesh/ui/hooks/useMeshStatus
 */

import { useState, useEffect, useMemo } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

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
 * Mesh status update message from extension
 */
interface MeshStatusUpdateMessage {
    status: MeshStatus;
    message?: string;
    endpoint?: string;
}

/**
 * Return type for useMeshStatus hook
 */
export interface UseMeshStatusReturn {
    /** Current mesh status */
    status: MeshStatus | undefined;
    /** Formatted status display (color and text) */
    display: StatusDisplay | null;
    /** Mesh endpoint URL if deployed */
    endpoint: string | undefined;
}

/**
 * Hook to subscribe to mesh status updates
 *
 * Listens for meshStatusUpdate messages from the extension and
 * provides formatted display information for the UI.
 *
 * @returns Current mesh status with display formatting
 *
 * @example
 * ```tsx
 * const { status, display, endpoint } = useMeshStatus();
 *
 * if (display) {
 *     return <Badge color={display.color}>{display.text}</Badge>;
 * }
 * ```
 */
export function useMeshStatus(): UseMeshStatusReturn {
    const [status, setStatus] = useState<MeshStatus | undefined>(undefined);
    const [message, setMessage] = useState<string | undefined>(undefined);
    const [endpoint, setEndpoint] = useState<string | undefined>(undefined);

    useEffect(() => {
        const unsubscribe = webviewClient.onMessage(
            'meshStatusUpdate',
            (data: unknown) => {
                const meshData = data as MeshStatusUpdateMessage;
                setStatus(meshData.status);
                setMessage(meshData.message);
                setEndpoint(meshData.endpoint);
            },
        );

        return unsubscribe;
    }, []);

    const display = useMemo((): StatusDisplay | null => {
        if (!status) return null;

        switch (status) {
            case 'checking':
                return { color: 'blue', text: 'Checking status...' };
            case 'needs-auth':
                return { color: 'yellow', text: 'Session expired' };
            case 'authenticating':
                return { color: 'blue', text: message || 'Signing in...' };
            case 'deploying':
                return { color: 'blue', text: message || 'Deploying...' };
            case 'deployed':
                return { color: 'green', text: 'Deployed' };
            case 'config-changed':
                return { color: 'yellow', text: 'Redeploy needed' };
            case 'config-incomplete':
                return { color: 'orange', text: 'Missing configuration' };
            case 'update-declined':
                return { color: 'orange', text: 'Needs deployment' };
            case 'not-deployed':
                return { color: 'gray', text: 'Not deployed' };
            case 'error':
                return { color: 'red', text: 'Deployment error' };
            default:
                return { color: 'gray', text: 'Unknown' };
        }
    }, [status, message]);

    return {
        status,
        display,
        endpoint,
    };
}
