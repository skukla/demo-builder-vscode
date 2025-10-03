import React, { useEffect, useState } from 'react';
import { Heading, Text, Flex, Button, ActionButton, DialogTrigger } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import Info from '@spectrum-icons/workflow/Info';
import InfoOutline from '@spectrum-icons/workflow/InfoOutline';
import { vscode } from '../../app/vscodeApi';
import { WizardState, WizardStep } from '../../types';
import { ConfigurationSummary } from '../shared/ConfigurationSummary';
import { LoadingDisplay } from '../shared/LoadingDisplay';
import { Modal } from '../shared/Modal';
import { NumberedInstructions } from '../shared/NumberedInstructions';

interface ApiMeshStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    onBack: () => void;
    setCanProceed: (canProceed: boolean) => void;
    completedSteps?: WizardStep[];
}

export function ApiMeshStep({ state, updateState, onBack, setCanProceed, completedSteps = [] }: ApiMeshStepProps) {
    const [message, setMessage] = useState<string>('Checking API Mesh API...');
    const [subMessage, setSubMessage] = useState<string>('Downloading workspace configuration');
    const [isChecking, setIsChecking] = useState<boolean>(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const [meshData, setMeshData] = useState<{ meshId?: string; status?: string; endpoint?: string } | null>(null);

    // Listen for progress updates during mesh creation
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.type === 'api-mesh-progress') {
                setMessage(message.message);
                if (message.subMessage) {
                    setSubMessage(message.subMessage);
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const runCheck = async () => {
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
                meshExists: false
            } 
        });

        // Show progress
        setTimeout(() => {
            if (isChecking) {
                setSubMessage('Verifying API availability');
            }
        }, 1000);

        setTimeout(() => {
            if (isChecking) {
                setSubMessage('Checking for existing mesh');
            }
        }, 2000);

        try {
            const result = await vscode.request('check-api-mesh', { 
                workspaceId: state.adobeWorkspace?.id,
                selectedComponents: []
            });

            if (result?.success && result.apiEnabled) {
                // API is enabled
                if (result.meshExists) {
                    // Mesh exists
                    setMeshData({
                        meshId: result.meshId,
                        status: result.meshStatus,
                        endpoint: result.endpoint
                    });
                    
                    updateState({ 
                        apiMesh: { 
                            isChecking: false,
                            apiEnabled: true,
                            meshExists: true,
                            meshId: result.meshId,
                            meshStatus: result.meshStatus,
                            endpoint: result.endpoint
                        } 
                    });
                    
                    setIsChecking(false);
                    setCanProceed(true);
                } else {
                    // API enabled, no mesh yet - don't allow proceeding until mesh is created
                    updateState({ 
                        apiMesh: { 
                            isChecking: false,
                            apiEnabled: true,
                            meshExists: false,
                            meshStatus: 'pending'
                        } 
                    });
                    
                    setIsChecking(false);
                    setCanProceed(false); // Disable Continue until mesh is created
                }
            } else {
                // API not enabled
                const err = result?.error || 'API Mesh API is not enabled for this workspace.';
                setError(err);
                updateState({ 
                    apiMesh: { 
                        isChecking: false,
                        apiEnabled: false,
                        meshExists: false,
                        error: err,
                        setupInstructions: result?.setupInstructions  // Include setup instructions
                    } 
                });
                setIsChecking(false);
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
                    error: err
                } 
            });
            setIsChecking(false);
            setCanProceed(false);
        }
    };

    useEffect(() => {
        // Start checking when the step loads
        runCheck();
    }, []); // Only run on mount

    return (
        <div style={{ display: 'flex', height: '100%', width: '100%', gap: '0' }}>
            {/* Left: Verification content area (max 800px) */}
            <div style={{
                maxWidth: '800px',
                width: '100%',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0
            }}>
                <Heading level={2} marginBottom="size-300">API Mesh</Heading>
                <Text marginBottom="size-400">
                    Verifying API Mesh API availability for your selected workspace.
                </Text>

                {isChecking ? (
                    <Flex direction="column" justifyContent="center" alignItems="center" height="400px">
                        <LoadingDisplay 
                            size="L"
                            message={message}
                            subMessage={subMessage}
                        />
                    </Flex>
                ) : error ? (
                    <Flex direction="column" justifyContent="center" alignItems="center" height="400px">
                        <Flex direction="column" gap="size-200" alignItems="center" maxWidth="600px">
                            <AlertCircle size="L" UNSAFE_className="text-red-600" />
                            <Flex direction="column" gap="size-100" alignItems="center">
                                <Text UNSAFE_className="text-xl font-medium">API Mesh API Not Enabled</Text>
                                <Text UNSAFE_className="text-sm text-gray-600">{error}</Text>
                            </Flex>
                            
                            {/* Setup Instructions Modal */}
                            {state.apiMesh?.setupInstructions && state.apiMesh.setupInstructions.length > 0 && (
                                <Flex direction="column" gap="size-100" marginTop="size-200" alignItems="center">
                                    <Text UNSAFE_className="text-sm text-gray-600">
                                        Follow the setup guide to enable API Mesh for this workspace.
                                    </Text>
                                    <DialogTrigger type="modal">
                                        <ActionButton isQuiet>
                                            <InfoOutline />
                                            <Text>View Setup Instructions</Text>
                                        </ActionButton>
                                        {(close) => (
                                            <Modal
                                                title="API Mesh Setup Guide"
                                                actionButtons={[
                                                    {
                                                        label: 'Open Workspace in Console',
                                                        variant: 'secondary',
                                                        onPress: () => {
                                                            vscode.postMessage('open-adobe-console', {
                                                                orgId: state.adobeProject?.org_id,
                                                                projectId: state.adobeProject?.id,
                                                                workspaceId: state.adobeWorkspace?.id
                                                            });
                                                        }
                                                    }
                                                ]}
                                                onClose={close}
                                            >
                                                <NumberedInstructions
                                                    description="Complete these steps to enable API Mesh for your workspace:"
                                                    instructions={state.apiMesh?.setupInstructions || []}
                                                />
                                            </Modal>
                                        )}
                                    </DialogTrigger>
                                </Flex>
                            )}
                            
                            <Flex gap="size-150" marginTop="size-300">
                                <Button variant="accent" onPress={runCheck}>Retry</Button>
                                <Button variant="secondary" onPress={onBack}>Back</Button>
                            </Flex>
                        </Flex>
                    </Flex>
                ) : meshData ? (
                    // Mesh exists
                    <Flex direction="column" justifyContent="center" alignItems="center" height="400px">
                        <Flex direction="column" gap="size-200" alignItems="center">
                            <CheckmarkCircle size="L" UNSAFE_className="text-green-600" />
                            <Flex direction="column" gap="size-100" alignItems="center">
                                <Text UNSAFE_className="text-xl font-medium">API Mesh Found</Text>
                                <Text UNSAFE_className="text-sm text-gray-600">
                                    An existing mesh was detected. It will be updated during deployment.
                                </Text>
                            </Flex>
                            
                            {meshData.meshId && (
                                <Flex direction="column" gap="size-100" marginTop="size-200" alignItems="center">
                                    <Flex gap="size-100">
                                        <Text UNSAFE_className="text-sm font-medium">Mesh ID:</Text>
                                        <Text UNSAFE_className="text-sm text-gray-600">{meshData.meshId}</Text>
                                    </Flex>
                                    <Flex gap="size-100">
                                        <Text UNSAFE_className="text-sm font-medium">Status:</Text>
                                        <Text UNSAFE_className="text-sm text-gray-600">
                                            {meshData.status === 'deployed' ? 'Deployed' : 'Not Deployed'}
                                        </Text>
                                    </Flex>
                                    {meshData.endpoint && (
                                        <Flex gap="size-100">
                                            <Text UNSAFE_className="text-sm font-medium">Endpoint:</Text>
                                            <Text UNSAFE_className="text-sm text-gray-600" UNSAFE_style={{ 
                                                wordBreak: 'break-all',
                                                maxWidth: '400px'
                                            }}>
                                                {meshData.endpoint}
                                            </Text>
                                        </Flex>
                                    )}
                                </Flex>
                            )}
                        </Flex>
                    </Flex>
                ) : (
                    // API enabled, no mesh
                    <Flex direction="column" justifyContent="center" alignItems="center" height="400px">
                        <Flex direction="column" gap="size-200" alignItems="center">
                            <Info size="L" UNSAFE_className="text-blue-600" />
                            <Flex direction="column" gap="size-100" alignItems="center">
                                <Text UNSAFE_className="text-xl font-medium">Ready for Mesh Creation</Text>
                                <Text UNSAFE_className="text-sm text-gray-600" UNSAFE_style={{ textAlign: 'center', maxWidth: '450px' }}>
                                    API Mesh API is enabled. Click below to create a new mesh.
                                </Text>
                            </Flex>
                            <Button 
                                variant="accent" 
                                marginTop="size-300"
                                onPress={async () => {
                                    setIsChecking(true);
                                    setMessage('Creating API Mesh...');
                                    setSubMessage('Setting up mesh infrastructure');
                                    updateState({ 
                                        apiMesh: { 
                                            ...state.apiMesh,
                                            isChecking: true,
                                            apiEnabled: state.apiMesh?.apiEnabled ?? false,
                                            meshExists: state.apiMesh?.meshExists ?? false
                                        } 
                                    });

                                    try {
                                        // Use 5-minute timeout for mesh creation (matches backend timeout)
                                        const result = await vscode.request('create-api-mesh', {
                                            workspaceId: state.adobeWorkspace?.id
                                        }, 300000); // 5 minutes

                                        if (result?.success && result.meshId) {
                                            updateState({ 
                                                apiMesh: { 
                                                    isChecking: false,
                                                    apiEnabled: true,
                                                    meshExists: true,
                                                    meshId: result.meshId,
                                                    meshStatus: 'deployed'
                                                } 
                                            });
                                            setCanProceed(true);
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
                                                error: err
                                            } 
                                        });
                                    } finally {
                                        setIsChecking(false);
                                    }
                                }}
                            >
                                Create Mesh
                            </Button>
                        </Flex>
                    </Flex>
                )}
            </div>

            {/* Right: Summary Panel - positioned after main content */}
            <div style={{
                flex: '1',
                padding: '24px',
                backgroundColor: 'var(--spectrum-global-color-gray-75)',
                borderLeft: '1px solid var(--spectrum-global-color-gray-200)'
            }}>
                <ConfigurationSummary state={state} completedSteps={completedSteps} currentStep={state.currentStep} />
            </div>
        </div>
    );
}

