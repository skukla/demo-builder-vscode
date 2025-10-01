import React, { useEffect, useState } from 'react';
import { Heading, Text, Flex, Button } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import Info from '@spectrum-icons/workflow/Info';
import { vscode } from '../../app/vscodeApi';
import { WizardState, WizardStep } from '../../types';
import { ConfigurationSummary } from '../shared/ConfigurationSummary';
import { LoadingDisplay } from '../shared/LoadingDisplay';

interface ApiMeshStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    onNext: () => void;
    onBack: () => void;
    setCanProceed: (canProceed: boolean) => void;
    completedSteps?: WizardStep[];
}

export function ApiMeshStep({ state, updateState, onNext, onBack, setCanProceed, completedSteps = [] }: ApiMeshStepProps) {
    const [message, setMessage] = useState<string>('Checking API Mesh API...');
    const [subMessage, setSubMessage] = useState<string>('Downloading workspace configuration');
    const [isChecking, setIsChecking] = useState<boolean>(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const [meshData, setMeshData] = useState<any>(null);

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
                workspaceId: state.adobeWorkspace?.id 
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
                    // API enabled, no mesh yet
                    updateState({ 
                        apiMesh: { 
                            isChecking: false,
                            apiEnabled: true,
                            meshExists: false,
                            meshStatus: 'pending'
                        } 
                    });
                    
                    setIsChecking(false);
                    setCanProceed(true);
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
                        error: err
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
                        <Flex direction="column" gap="size-200" alignItems="center">
                            <AlertCircle size="L" UNSAFE_className="text-red-600" />
                            <Flex direction="column" gap="size-100" alignItems="center">
                                <Text UNSAFE_className="text-xl font-medium">API Mesh API Not Enabled</Text>
                                <Text UNSAFE_className="text-sm text-gray-600">{error}</Text>
                            </Flex>
                            <Flex gap="size-150" marginTop="size-300">
                                <Button 
                                    variant="secondary" 
                                    onPress={() => {
                                        const payload = {
                                            orgId: state.adobeProject?.org_id,
                                            projectId: state.adobeProject?.id,
                                            workspaceId: state.adobeWorkspace?.id
                                        };
                                        console.log('[ApiMeshStep] Button clicked!');
                                        console.log('[ApiMeshStep] state.adobeProject:', state.adobeProject);
                                        console.log('[ApiMeshStep] state.adobeWorkspace:', state.adobeWorkspace);
                                        console.log('[ApiMeshStep] Payload to send:', payload);
                                        console.log('[ApiMeshStep] All values defined?', {
                                            hasOrgId: payload.orgId !== undefined,
                                            hasProjectId: payload.projectId !== undefined,
                                            hasWorkspaceId: payload.workspaceId !== undefined
                                        });
                                        vscode.postMessage('open-adobe-console', payload);
                                    }}
                                >
                                    Open Workspace in Console
                                </Button>
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
                                    API Mesh API is enabled. A mesh will be created during deployment.
                                </Text>
                            </Flex>
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
                <ConfigurationSummary state={state} completedSteps={completedSteps} />
            </div>
        </div>
    );
}

