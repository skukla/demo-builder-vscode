import React, { useEffect, useState } from 'react';
import {
    View,
    Flex,
    Heading,
    Text,
    Button,
    Well,
    ProgressCircle,
    Content
} from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import { WizardState } from '../../types';
import { vscode } from '../../app/vscodeApi';

interface AdobeAuthStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
}

export function AdobeAuthStep({ state, updateState, setCanProceed }: AdobeAuthStepProps) {
    const [isChecking, setIsChecking] = useState(false);
    const [authStatus, setAuthStatus] = useState<string>('');

    useEffect(() => {
        checkAuthentication();

        // Listen for auth status updates
        const unsubscribe = vscode.onMessage('auth-status', (data) => {
            updateState({
                adobeAuth: {
                    isAuthenticated: data.isAuthenticated,
                    isChecking: false,
                    email: data.email,
                    error: data.error
                }
            });
            setAuthStatus(data.message || '');
            setIsChecking(false);
        });

        return unsubscribe;
    }, []);

    useEffect(() => {
        setCanProceed(state.adobeAuth.isAuthenticated);
    }, [state.adobeAuth.isAuthenticated, setCanProceed]);

    const checkAuthentication = () => {
        setIsChecking(true);
        setAuthStatus('Checking Adobe authentication...');
        updateState({
            adobeAuth: { ...state.adobeAuth, isChecking: true }
        });
        vscode.postMessage('check-auth');
    };

    const handleLogin = (force: boolean = false) => {
        setIsChecking(true);
        setAuthStatus(force ? 'Starting fresh login...' : 'Opening browser for login...');
        vscode.requestAuth(force);
    };

    return (
        <View padding="size-400" maxWidth="size-6000">
            <Heading level={2} marginBottom="size-300">
                Adobe Authentication
            </Heading>
            
            <Text marginBottom="size-400">
                We need to authenticate with Adobe to deploy your API Mesh and access Adobe services.
            </Text>

            <Well>
                <Flex direction="column" gap="size-200">
                    {isChecking ? (
                        <Flex gap="size-200" alignItems="center">
                            <ProgressCircle size="S" isIndeterminate />
                            <Text>{authStatus}</Text>
                        </Flex>
                    ) : state.adobeAuth.isAuthenticated ? (
                        <Flex gap="size-200" alignItems="center">
                            <CheckmarkCircle color="positive" />
                            <View>
                                <Text><strong>Authenticated</strong></Text>
                                {state.adobeAuth.email && (
                                    <Text elementType="small" color="gray-700">
                                        Signed in as {state.adobeAuth.email}
                                    </Text>
                                )}
                            </View>
                        </Flex>
                    ) : (
                        <Flex gap="size-200" alignItems="center">
                            <AlertCircle color="notice" />
                            <View flex>
                                <Text><strong>Authentication Required</strong></Text>
                                <Text elementType="small" color="gray-700">
                                    {state.adobeAuth.error || 'Please sign in to continue'}
                                </Text>
                            </View>
                        </Flex>
                    )}
                </Flex>
            </Well>

            {!state.adobeAuth.isAuthenticated && !isChecking && (
                <Flex gap="size-200" marginTop="size-300">
                    <Button
                        variant="accent"
                        onPress={() => handleLogin(false)}
                    >
                        Sign In
                    </Button>
                    <Button
                        variant="secondary"
                        onPress={() => handleLogin(true)}
                    >
                        Force Fresh Login
                    </Button>
                    <Button
                        variant="secondary"
                        isQuiet
                        onPress={checkAuthentication}
                    >
                        Recheck Status
                    </Button>
                </Flex>
            )}

            {state.adobeAuth.isAuthenticated && (
                <Well marginTop="size-400" backgroundColor="green-100">
                    <Content>
                        Authentication successful! You can proceed to the next step.
                    </Content>
                </Well>
            )}
        </View>
    );
}