import { useState, useCallback } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { WizardState } from '@/types/webview';

interface MeshWorkspace {
    id: string;
    name: string;
    title: string;
}

interface CheckApiMeshResponse {
    success: boolean;
    apiEnabled?: boolean;
    meshExists?: boolean;
    meshId?: string;
    meshStatus?: 'deployed' | 'not-deployed' | 'pending' | 'error';
    endpoint?: string;
    error?: string;
    setupInstructions?: Array<{ step: string; details: string; important?: boolean }>;
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

export function useMeshOperations(
    workspace: MeshWorkspace | undefined,
    updateState: (updates: Partial<WizardState>) => void,
    setCanProceed: (canProceed: boolean) => void
) {
    const [isChecking, setIsChecking] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const [message, setMessage] = useState<string>('Checking API Mesh API...');
    const [subMessage, setSubMessage] = useState<string>('Downloading workspace configuration');
    const [helperText, setHelperText] = useState<string | undefined>(undefined);
    const [meshData, setMeshData] = useState<{ meshId?: string; status?: string; endpoint?: string } | null>(null);

    const checkMesh = useCallback(async () => {
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

        try {
            const result = await webviewClient.request<CheckApiMeshResponse>('check-api-mesh', {
                workspaceId: workspace?.id,
                selectedComponents: [],
            });

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
                setCanProceed(false);
            }
        } catch (e) {
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
            setCanProceed(false);
        } finally {
            setIsChecking(false);
        }
    }, [workspace?.id, updateState, setCanProceed]);

    const createMesh = useCallback(async () => {
        setIsChecking(true);
        setMessage('Creating API Mesh...');
        setSubMessage('Setting up mesh infrastructure');
        setHelperText('This could take up to 2 minutes');
        setError(undefined);

        updateState({
            apiMesh: {
                isChecking: true,
                apiEnabled: true,
                meshExists: false,
            },
        });

        try {
            const result = await webviewClient.request<CreateApiMeshResponse>('create-api-mesh', {
                workspaceId: workspace?.id,
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
    }, [workspace?.id, updateState, setCanProceed]);

    const recreateMesh = useCallback(async () => {
        setIsChecking(true);
        setMessage('Deleting broken mesh...');
        setSubMessage('Removing existing mesh');
        setHelperText('This could take up to 2 minutes');
        setError(undefined);

        try {
            await webviewClient.request('delete-api-mesh', {
                workspaceId: workspace?.id,
            });

            setMessage('Creating new mesh...');
            setSubMessage('Submitting configuration to Adobe');

            const result = await webviewClient.request<CreateApiMeshResponse>('create-api-mesh', {
                workspaceId: workspace?.id,
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
                setMeshData(null);
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
    }, [workspace?.id, updateState, setCanProceed]);

    return {
        isChecking,
        error,
        message,
        subMessage,
        helperText,
        meshData,
        checkMesh,
        createMesh,
        recreateMesh,
    };
}
