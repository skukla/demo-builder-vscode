import { useEffect, useState, useCallback, useRef } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { WizardState } from '@/types/webview';
import { ErrorCode } from '@/types/errorCodes';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

interface CheckApiMeshResponse {
    success: boolean;
    apiEnabled?: boolean;
    meshExists?: boolean;
    meshId?: string;
    meshStatus?: 'deployed' | 'not-deployed' | 'pending' | 'error';
    endpoint?: string;
    error?: string;
    code?: ErrorCode;
    setupInstructions?: { step: string; details: string; important?: boolean }[];
}

interface CreateApiMeshResponse {
    success: boolean;
    meshId?: string;
    endpoint?: string;
    meshExists?: boolean;
    meshStatus?: 'deployed' | 'error';
    message?: string;
    error?: string;
    code?: ErrorCode;
}

interface MeshData {
    meshId?: string;
    status?: string;
    endpoint?: string;
}

interface UseMeshOperationsProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
}

interface UseMeshOperationsReturn {
    message: string;
    subMessage: string;
    helperText: string | undefined;
    isChecking: boolean;
    error: string | undefined;
    errorCode: ErrorCode | undefined;
    meshData: MeshData | null;
    runCheck: () => Promise<void>;
    createMesh: () => Promise<void>;
    recreateMesh: () => Promise<void>;
}

/**
 * Handle mesh creation result - shared logic between createMesh and recreateMesh
 *
 * Handles the success, error-state, and failure cases for mesh creation operations.
 * Returns true if mesh was successfully created/deployed, false otherwise.
 */
function handleMeshCreationResult(
    result: CreateApiMeshResponse | undefined,
    updateState: (updates: Partial<WizardState>) => void,
    setMeshData: (data: MeshData | null) => void,
    setCanProceed: (canProceed: boolean) => void,
): { success: boolean; meshId?: string; endpoint?: string; message?: string } {
    if (result?.success) {
        const isDeployed = !!result.meshId;
        updateState({
            apiMesh: {
                isChecking: false,
                apiEnabled: true,
                meshExists: true,
                meshId: result.meshId,
                meshStatus: isDeployed ? 'deployed' : 'pending',
                endpoint: result.endpoint,
                message: result.message,
            },
        });

        if (isDeployed) {
            setMeshData({
                meshId: result.meshId,
                status: 'deployed',
                endpoint: result.endpoint,
            });
        } else {
            setMeshData(null);
        }

        setCanProceed(true);
        return { success: true, meshId: result.meshId, endpoint: result.endpoint, message: result.message };
    }

    if (result?.meshExists && result?.meshStatus === 'error') {
        setMeshData({
            meshId: result.meshId,
            status: 'error',
            endpoint: undefined,
        });
        updateState({
            apiMesh: {
                isChecking: false,
                apiEnabled: true,
                meshExists: true,
                meshId: result.meshId,
                meshStatus: 'error',
                error: result.error,
            },
        });
        setCanProceed(false);
        return { success: false };
    }

    // Neither success nor error-state - throw for caller to handle
    throw new Error(result?.error || 'Failed to create mesh');
}

export function useMeshOperations({
    state,
    updateState,
    setCanProceed,
}: UseMeshOperationsProps): UseMeshOperationsReturn {
    const [message, setMessage] = useState<string>('Checking API Mesh API...');
    const [subMessage, setSubMessage] = useState<string>('Downloading workspace configuration');
    const [helperText, setHelperText] = useState<string | undefined>(undefined);
    const [isChecking, setIsChecking] = useState<boolean>(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const [errorCode, setErrorCode] = useState<ErrorCode | undefined>(undefined);
    const [meshData, setMeshData] = useState<MeshData | null>(null);

    // Track timeouts for cleanup on unmount
    const timeoutsRef = useRef<NodeJS.Timeout[]>([]);

    // Cleanup timeouts on unmount
    useEffect(() => {
        return () => {
            timeoutsRef.current.forEach(clearTimeout);
            timeoutsRef.current = [];
        };
    }, []);

    // Listen for progress updates during mesh creation
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const msg = event.data;
            if (msg.type === 'api-mesh-progress') {
                const { message: progressMessage, subMessage: progressSubMessage } = msg.payload || {};
                if (progressMessage) setMessage(progressMessage);
                if (progressSubMessage) setSubMessage(progressSubMessage);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const runCheck = useCallback(async () => {
        setIsChecking(true);
        setError(undefined);
        setErrorCode(undefined);
        setCanProceed(false);
        setMessage('Checking API Mesh API...');
        setSubMessage('Downloading workspace configuration');

        updateState({
            apiMesh: {
                isChecking: true,
                message: 'Checking API Mesh API...',
                subMessage: 'Downloading workspace configuration',
                apiEnabled: false,
                meshExists: false,
            },
        });

        // Progress indicators - tracked for cleanup
        const timeout1 = setTimeout(() => {
            if (isChecking) setSubMessage('Verifying API availability');
        }, TIMEOUTS.PROGRESS_MESSAGE_DELAY);
        timeoutsRef.current.push(timeout1);

        const timeout2 = setTimeout(() => {
            if (isChecking) setSubMessage('Checking for existing mesh');
        }, TIMEOUTS.PROGRESS_MESSAGE_DELAY_LONG);
        timeoutsRef.current.push(timeout2);

        try {
            const result = await webviewClient.request<CheckApiMeshResponse>('check-api-mesh', {
                workspaceId: state.adobeWorkspace?.id,
                selectedComponents: [],
            });

            // Clear these specific timeouts (they may have already fired)
            clearTimeout(timeout1);
            clearTimeout(timeout2);
            timeoutsRef.current = timeoutsRef.current.filter(t => t !== timeout1 && t !== timeout2);

            if (result?.success && result.apiEnabled) {
                if (result.meshExists) {
                    setMeshData({
                        meshId: result.meshId,
                        status: result.meshStatus,
                        endpoint: result.endpoint,
                    });
                    updateState({
                        apiMesh: {
                            isChecking: false,
                            apiEnabled: true,
                            meshExists: true,
                            meshId: result.meshId,
                            meshStatus: result.meshStatus,
                            endpoint: result.endpoint,
                        },
                    });
                    setIsChecking(false);
                    setCanProceed(true);
                } else {
                    updateState({
                        apiMesh: {
                            isChecking: false,
                            apiEnabled: true,
                            meshExists: false,
                            meshStatus: 'pending',
                        },
                    });
                    setIsChecking(false);
                    setCanProceed(false);
                }
            } else {
                const err = result?.error || 'API Mesh API is not enabled for this workspace.';
                setError(err);
                setErrorCode(result?.code);
                updateState({
                    apiMesh: {
                        isChecking: false,
                        apiEnabled: false,
                        meshExists: false,
                        error: err,
                        code: result?.code,
                        setupInstructions: result?.setupInstructions,
                    },
                });
                setIsChecking(false);
                setCanProceed(false);
            }
        } catch (e) {
            // Clear these specific timeouts (they may have already fired)
            clearTimeout(timeout1);
            clearTimeout(timeout2);
            timeoutsRef.current = timeoutsRef.current.filter(t => t !== timeout1 && t !== timeout2);
            const err = e instanceof Error ? e.message : 'Failed to verify API Mesh availability';
            setError(err);
            updateState({
                apiMesh: {
                    isChecking: false,
                    apiEnabled: false,
                    meshExists: false,
                    error: err,
                },
            });
            setIsChecking(false);
            setCanProceed(false);
        }
    }, [state.adobeWorkspace?.id, updateState, setCanProceed, isChecking]);

    const createMesh = useCallback(async () => {
        setIsChecking(true);
        setMessage('Creating API Mesh...');
        setSubMessage('Setting up mesh infrastructure');
        setHelperText('This could take up to 2 minutes');
        updateState({
            apiMesh: {
                ...state.apiMesh,
                isChecking: true,
                apiEnabled: state.apiMesh?.apiEnabled ?? false,
                meshExists: state.apiMesh?.meshExists ?? false,
            },
        });

        try {
            const result = await webviewClient.request<CreateApiMeshResponse>('create-api-mesh', {
                workspaceId: state.adobeWorkspace?.id,
            });

            const outcome = handleMeshCreationResult(result, updateState, setMeshData, setCanProceed);

            // Show pending message if mesh was submitted but not yet deployed
            if (outcome.success && outcome.message && !outcome.meshId) {
                setMessage('✓ Mesh Submitted');
                setSubMessage(outcome.message);
            }
        } catch (e) {
            const err = e instanceof Error ? e.message : 'Failed to create mesh';
            setError(err);
            updateState({
                apiMesh: {
                    isChecking: false,
                    apiEnabled: true,
                    meshExists: false,
                    error: err,
                },
            });
            setCanProceed(false);
        } finally {
            setIsChecking(false);
        }
    }, [state.apiMesh, state.adobeWorkspace?.id, updateState, setCanProceed]);

    const recreateMesh = useCallback(async () => {
        setIsChecking(true);
        setMessage('Deleting broken mesh...');
        setSubMessage('Removing existing mesh');
        setHelperText('This could take up to 2 minutes');

        try {
            await webviewClient.request('delete-api-mesh', {
                workspaceId: state.adobeWorkspace?.id,
            });

            setMessage('Creating new mesh...');
            setSubMessage('Submitting configuration to Adobe');

            const result = await webviewClient.request<CreateApiMeshResponse>('create-api-mesh', {
                workspaceId: state.adobeWorkspace?.id,
            });

            handleMeshCreationResult(result, updateState, setMeshData, setCanProceed);
        } catch (e) {
            const err = e instanceof Error ? e.message : 'Failed to recreate mesh';
            setError(err);
            updateState({
                apiMesh: {
                    isChecking: false,
                    apiEnabled: true,
                    meshExists: false,
                    error: err,
                },
            });
        } finally {
            setIsChecking(false);
        }
    }, [state.adobeWorkspace?.id, updateState, setCanProceed]);

    // Run check on mount
    useEffect(() => {
        runCheck();
    }, []);

    return {
        message,
        subMessage,
        helperText,
        isChecking,
        error,
        errorCode,
        meshData,
        runCheck,
        createMesh,
        recreateMesh,
    };
}
