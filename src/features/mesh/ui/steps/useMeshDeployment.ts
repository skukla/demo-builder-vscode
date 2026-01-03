/**
 * useMeshDeployment - Custom hook for mesh deployment state management
 *
 * Encapsulates mesh deployment logic during project creation, including:
 * - Deployment initiation
 * - Verification polling
 * - Timeout handling
 * - Retry functionality
 *
 * PM Decision (2025-12-06): No auto-retry, 180s total timeout
 *
 * @module features/mesh/ui/steps/useMeshDeployment
 */

import { useEffect, useReducer, useRef, useCallback } from 'react';
import { MeshDeploymentState, INITIAL_MESH_DEPLOYMENT_STATE } from './meshDeploymentTypes';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/**
 * Type for mesh verification result from backend
 */
interface MeshVerificationResult {
    success: boolean;
    verified?: boolean;
    meshId?: string;
    endpoint?: string;
    error?: string;
}

/**
 * Check if verification result indicates successful mesh deployment (SOP §4)
 *
 * Extracts compound condition:
 * `verifyResult?.success && verifyResult?.verified`
 */
function isVerificationSuccessful(result: MeshVerificationResult | undefined): boolean {
    return Boolean(result?.success && result?.verified);
}

interface UseMeshDeploymentProps {
    /** Whether the project includes a mesh component */
    hasMeshComponent: boolean;
    /** Workspace ID for deployment */
    workspaceId?: string;
}

interface UseMeshDeploymentReturn {
    /** Current deployment state */
    state: MeshDeploymentState;
    /** Retry deployment from timeout/error state */
    retry: () => void;
}

// Action types for reducer
type MeshDeploymentAction =
    | { type: 'START_DEPLOYMENT' }
    | { type: 'DEPLOYMENT_SUBMITTED' }
    | { type: 'VERIFICATION_ATTEMPT'; attempt: number }
    | { type: 'TICK_ELAPSED'; elapsedSeconds: number }
    | { type: 'SUCCESS'; meshId: string; endpoint: string }
    | { type: 'TIMEOUT' }
    | { type: 'ERROR'; errorMessage: string }
    | { type: 'RETRY'; retryAttempt: number }
    | { type: 'SKIP' };

/**
 * Reducer for mesh deployment state machine
 */
function meshDeploymentReducer(
    state: MeshDeploymentState,
    action: MeshDeploymentAction,
): MeshDeploymentState {
    switch (action.type) {
        case 'START_DEPLOYMENT':
            return {
                ...INITIAL_MESH_DEPLOYMENT_STATE,
                status: 'deploying',
                message: 'Deploying API Mesh...',
            };

        case 'DEPLOYMENT_SUBMITTED':
            return {
                ...state,
                status: 'verifying',
                message: 'Verifying deployment...',
            };

        case 'VERIFICATION_ATTEMPT':
            return {
                ...state,
                attempt: action.attempt,
                message: `Verifying deployment (${action.attempt}/${state.maxAttempts})...`,
            };

        case 'TICK_ELAPSED':
            return {
                ...state,
                elapsedSeconds: action.elapsedSeconds,
            };

        case 'SUCCESS':
            return {
                ...state,
                status: 'success',
                meshId: action.meshId,
                endpoint: action.endpoint,
                message: 'Mesh deployed successfully!',
            };

        case 'TIMEOUT':
            return {
                ...state,
                status: 'timeout',
                message: 'Deployment timed out. The mesh may still be deploying in the background.',
            };

        case 'ERROR':
            return {
                ...state,
                status: 'error',
                errorMessage: action.errorMessage,
                message: 'Mesh deployment failed',
            };

        case 'RETRY':
            return {
                ...INITIAL_MESH_DEPLOYMENT_STATE,
                status: 'deploying',
                attempt: action.retryAttempt,
                message: 'Retrying deployment...',
            };

        case 'SKIP':
            return {
                ...INITIAL_MESH_DEPLOYMENT_STATE,
                status: 'success',
                message: 'No mesh component selected',
            };

        default:
            return state;
    }
}

/**
 * Hook for managing mesh deployment during project creation
 */
export function useMeshDeployment({
    hasMeshComponent,
    workspaceId,
}: UseMeshDeploymentProps): UseMeshDeploymentReturn {
    const [state, dispatch] = useReducer(meshDeploymentReducer, {
        ...INITIAL_MESH_DEPLOYMENT_STATE,
        status: hasMeshComponent ? 'deploying' : 'success',
    });

    // Track retry count across the component lifecycle
    const retryCountRef = useRef(0);
    const startTimeRef = useRef<number | null>(null);
    const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);
    const elapsedIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const verifyIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const isMountedRef = useRef(true);

    // Cleanup function
    const cleanup = useCallback(() => {
        if (timeoutIdRef.current) {
            clearTimeout(timeoutIdRef.current);
            timeoutIdRef.current = null;
        }
        if (elapsedIntervalRef.current) {
            clearInterval(elapsedIntervalRef.current);
            elapsedIntervalRef.current = null;
        }
        if (verifyIntervalRef.current) {
            clearInterval(verifyIntervalRef.current);
            verifyIntervalRef.current = null;
        }
    }, []);

    // Start deployment
    const startDeployment = useCallback(async () => {
        if (!workspaceId || !hasMeshComponent) {
            dispatch({ type: 'SKIP' });
            return;
        }

        cleanup();
        startTimeRef.current = Date.now();

        try {
            // Submit deployment command
            const deployResult = await webviewClient.request<{
                success: boolean;
                status?: string;
                error?: string;
            }>('deploy-mesh-step', { workspaceId });

            if (!isMountedRef.current) return;

            if (!deployResult?.success) {
                dispatch({ type: 'ERROR', errorMessage: deployResult?.error || 'Deployment failed' });
                return;
            }

            // Move to verification phase
            dispatch({ type: 'DEPLOYMENT_SUBMITTED' });

            // Set up total timeout (180s)
            timeoutIdRef.current = setTimeout(() => {
                if (isMountedRef.current) {
                    cleanup();
                    dispatch({ type: 'TIMEOUT' });
                }
            }, TIMEOUTS.LONG);

            // Set up elapsed time tracking (every second)
            elapsedIntervalRef.current = setInterval(() => {
                if (startTimeRef.current && isMountedRef.current) {
                    const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
                    dispatch({ type: 'TICK_ELAPSED', elapsedSeconds: elapsed });
                }
            }, TIMEOUTS.PROGRESS_UPDATE_INTERVAL);

            // Start verification polling after initial wait
            let verifyAttempt = 0;
            const verifyMesh = async () => {
                verifyAttempt++;

                if (!isMountedRef.current) return;

                dispatch({ type: 'VERIFICATION_ATTEMPT', attempt: verifyAttempt });

                try {
                    const verifyResult = await webviewClient.request<MeshVerificationResult>(
                        'verify-mesh-deployment',
                        { workspaceId },
                    );

                    if (!isMountedRef.current) return;

                    if (isVerificationSuccessful(verifyResult)) {
                        cleanup();
                        dispatch({
                            type: 'SUCCESS',
                            meshId: verifyResult?.meshId || '',
                            endpoint: verifyResult?.endpoint || '',
                        });
                    } else if (verifyResult?.success === false && verifyResult?.error) {
                        cleanup();
                        dispatch({ type: 'ERROR', errorMessage: verifyResult.error });
                    }
                    // If verified is false, continue polling
                } catch {
                    // On network error during verification, continue polling
                    // (transient errors shouldn't fail deployment)
                }
            };

            // Initial wait before first verification
            setTimeout(() => {
                if (!isMountedRef.current) return;
                verifyMesh();
                verifyIntervalRef.current = setInterval(verifyMesh, TIMEOUTS.MESH_VERIFY_POLL_INTERVAL);
            }, TIMEOUTS.MESH_VERIFY_INITIAL_WAIT);
        } catch (e) {
            if (!isMountedRef.current) return;
            const errorMessage = e instanceof Error ? e.message : 'Deployment failed';
            dispatch({ type: 'ERROR', errorMessage });
        }
    }, [workspaceId, hasMeshComponent, cleanup]);

    // Retry function
    const retry = useCallback(() => {
        retryCountRef.current++;
        dispatch({ type: 'RETRY', retryAttempt: retryCountRef.current });
        startDeployment();
    }, [startDeployment]);

    // Start deployment on mount (if hasMeshComponent)
    useEffect(() => {
        isMountedRef.current = true;

        if (hasMeshComponent) {
            startDeployment();
        }

        return () => {
            isMountedRef.current = false;
            cleanup();
        };
    }, [hasMeshComponent, startDeployment, cleanup]);

    return {
        state,
        retry,
    };
}
