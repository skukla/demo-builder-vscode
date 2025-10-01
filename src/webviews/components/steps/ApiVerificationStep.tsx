import React, { useEffect, useState } from 'react';
import { View, Heading, Text, Flex, Button, Well } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import { vscode } from '../../app/vscodeApi';
import { WizardState, WizardStep } from '../../types';
import { ConfigurationSummary } from '../shared/ConfigurationSummary';
import { LoadingDisplay } from '../shared/LoadingDisplay';

interface ApiVerificationStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    onNext: () => void;
    onBack: () => void;
    setCanProceed: (canProceed: boolean) => void;
    completedSteps?: WizardStep[];
}

export function ApiVerificationStep({ state, updateState, onNext, onBack, setCanProceed, completedSteps = [] }: ApiVerificationStepProps) {
    const [message, setMessage] = useState<string>('Verifying API Mesh access…');
    const [subMessage, setSubMessage] = useState<string>('Checking required APIs for the selected project');
    const [isChecking, setIsChecking] = useState<boolean>(false);
    const [error, setError] = useState<string | undefined>(undefined);

    const runCheck = async () => {
        setIsChecking(true);
        setError(undefined);
        setCanProceed(false);
        updateState({ apiVerification: { isChecking: true } as any });
        try {
            const result = await vscode.request('check-project-apis', { projectId: state.adobeProject?.id });
            if (result?.success && result.hasMesh) {
                updateState({ apiVerification: { isChecking: false, hasMesh: true } as any });
                setIsChecking(false);
                setCanProceed(true);
            } else {
                const err = result?.error || 'API Mesh is not enabled for this project.';
                setError(err);
                updateState({ apiVerification: { isChecking: false, hasMesh: false, error: err } as any });
                setIsChecking(false);
                setCanProceed(false);
            }
        } catch (e) {
            const err = e instanceof Error ? e.message : 'Failed to verify required APIs';
            setError(err);
            updateState({ apiVerification: { isChecking: false, hasMesh: false, error: err } as any });
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
                <Heading level={2} marginBottom="size-300">API Verification</Heading>
                <Text UNSAFE_className="text-gray-700">We will verify that your Adobe I/O project has API Mesh enabled.</Text>

                {isChecking ? (
                    <Flex justifyContent="center" alignItems="center" height="100%">
                        <LoadingDisplay 
                            size="L"
                            message={message}
                            subMessage={subMessage}
                        />
                    </Flex>
                ) : error ? (
                    <Well marginTop="size-200">
                        <Flex gap="size-200" alignItems="center">
                            <AlertCircle UNSAFE_className="text-red-600" />
                            <Flex direction="column" gap="size-50">
                                <Text><strong>API Mesh Not Enabled</strong></Text>
                                <Text UNSAFE_className="text-sm">{error}</Text>
                            </Flex>
                        </Flex>
                        <Flex gap="size-150" marginTop="size-200">
                            <Button variant="secondary" onPress={() => vscode.postMessage('open-adobe-console')}>Open Adobe Console</Button>
                            <Button variant="accent" onPress={runCheck}>Retry</Button>
                            <Button variant="secondary" onPress={onBack}>Back</Button>
                        </Flex>
                    </Well>
                ) : (
                    <Flex direction="column" gap="size-300" alignItems="center" justifyContent="center" UNSAFE_style={{ flex: 1 }}>
                        <Flex direction="column" gap="size-200" alignItems="center">
                            <CheckmarkCircle size="L" UNSAFE_className="text-green-600" />
                            <Flex direction="column" gap="size-50" alignItems="center">
                                <Text UNSAFE_className="text-lg font-medium">API Mesh verified</Text>
                                <Text UNSAFE_className="text-sm text-gray-600">You can continue to the next step.</Text>
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
                <ConfigurationSummary state={state} completedSteps={completedSteps} showWorkspaceApis />
            </div>
        </div>
    );
}
