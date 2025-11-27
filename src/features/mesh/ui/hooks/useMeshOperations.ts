import { useEffect, useState, useCallback } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { WizardState } from '@/types/webview';

interface CheckApiMeshResponse {
    success: boolean;
    apiEnabled?: boolean;
    meshExists?: boolean;
    meshId?: string;
    meshStatus?: 'deployed' | 'not-deployed' | 'pending' | 'error';
    endpoint?: string;
    error?: string;
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
    meshData: MeshData | null;
    runCheck: () => Promise<void>;
    createMesh: () => Promise<void>;
    recreateMesh: () => Promise<void>;
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
    const [meshData, setMeshData] = useState<MeshData | null>(null);

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

        // Progress indicators
        const timeout1 = setTimeout(() => {
            if (isChecking) setSubMessage('Verifying API availability');
        }, 1000);

        const timeout2 = setTimeout(() => {
            if (isChecking) setSubMessage('Checking for existing mesh');
        }, 2000);

        try {
            const result = await webviewClient.request<CheckApiMeshResponse>('check-api-mesh', {
                workspaceId: state.adobeWorkspace?.id,
                selectedComponents: [],
            });

            clearTimeout(timeout1);
            clearTimeout(timeout2);

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
                updateState({
                    apiMesh: {
                        isChecking: false,
                        apiEnabled: false,
                        meshExists: false,
                        error: err,
                        setupInstructions: result?.setupInstructions,
                    },
                });
                setIsChecking(false);
                setCanProceed(false);
            }
        } catch (e) {
            clearTimeout(timeout1);
            clearTimeout(timeout2);
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

                if (result.message && !isDeployed) {
                    setMessage('✓ Mesh Submitted');
                    setSubMessage(result.message);
                }
            } else if (result?.meshExists && result?.meshStatus === 'error') {
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
            } else {
                throw new Error(result?.error || 'Failed to create mesh');
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

            if (result?.success) {
                updateState({
                    apiMesh: {
                        isChecking: false,
                        apiEnabled: true,
                        meshExists: true,
                        meshId: result.meshId,
                        meshStatus: 'deployed',
                        endpoint: result.endpoint,
                    },
                });
                setMeshData({
                    meshId: result.meshId,
                    status: 'deployed',
                    endpoint: result.endpoint,
                });
                setCanProceed(true);
            } else if (result?.meshExists && result?.meshStatus === 'error') {
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
            } else {
                throw new Error(result?.error || 'Failed to create mesh');
            }
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
        meshData,
        runCheck,
        createMesh,
        recreateMesh,
    };
}
