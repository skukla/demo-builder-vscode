import React, { useEffect, useState, useRef } from 'react';
import {
    Flex,
    Heading,
    Text,
    Button,
    Well,
    ProgressCircle
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
    const [authStatus, setAuthStatus] = useState<string>('');
    const isSwitchingRef = useRef(false);

    useEffect(() => {
        // Only check authentication if we don't already have a known state
        // AND we're not currently checking/switching
        // This prevents re-checking when switching orgs
        if (state.adobeAuth.isAuthenticated === undefined && !state.adobeAuth.isChecking) {
            checkAuthentication();
        }

        // Listen for auth status updates
        const unsubscribe = vscode.onMessage('auth-status', (data) => {
            // Reset the switching flag when authentication completes
            if (data.isAuthenticated && isSwitchingRef.current) {
                isSwitchingRef.current = false;
            }
            
            updateState({
                adobeAuth: {
                    isAuthenticated: data.isAuthenticated,
                    isChecking: data.isChecking !== undefined ? data.isChecking : false,
                    email: data.email,
                    error: data.error
                },
                // Always update org - set to undefined when null/undefined
                adobeOrg: data.organization ? {
                    id: data.organization.id,
                    code: data.organization.code,
                    name: data.organization.name
                } : undefined
            });
            setAuthStatus(data.message || '');
        });

        return unsubscribe;
    }, []);

    useEffect(() => {
        setCanProceed(state.adobeAuth.isAuthenticated);
    }, [state.adobeAuth.isAuthenticated, setCanProceed]);

    const checkAuthentication = () => {
        // Don't check if we're already in the process of switching organizations
        // Use ref for immediate check, not waiting for state updates
        if (isSwitchingRef.current || state.adobeAuth.isChecking) {
            console.log('Skipping auth check - switching org or already checking');
            return;
        }
        setAuthStatus('Checking Adobe authentication...');
        updateState({
            adobeAuth: { ...state.adobeAuth, isChecking: true }
        });
        vscode.postMessage('check-auth');
    };

    const handleLogin = (force: boolean = false) => {
        // Immediately set the ref when switching orgs to prevent race conditions
        if (force) {
            isSwitchingRef.current = true;
        }
        
        // Update all state in a single call to prevent UI blips
        updateState({
            adobeAuth: { 
                ...state.adobeAuth, 
                isChecking: true,
                // Set authenticated to false when switching orgs to hide the current state
                isAuthenticated: force ? false : state.adobeAuth.isAuthenticated
            },
            // Clear organization-related state when switching
            ...(force && {
                adobeOrg: undefined,
                adobeProject: undefined,
                adobeWorkspace: undefined
            })
        });
        setAuthStatus(force ? 'Starting fresh login...' : 'Opening browser for login...');
        
        vscode.requestAuth(force);
    };

    return (
        <div style={{ maxWidth: '800px', width: '100%', margin: '0', padding: '24px' }}>
            <Heading level={2} marginBottom="size-300">
                Adobe Authentication
            </Heading>
            
            <Text marginBottom="size-400">
                We need to authenticate with Adobe to deploy your API Mesh and access Adobe services.
            </Text>

            {/* Authentication Status */}
            {state.adobeAuth.isChecking && (
                <Well>
                    <Flex gap="size-200" alignItems="center">
                        <ProgressCircle size="S" isIndeterminate />
                        <Flex direction="column" gap="size-50">
                            <Text>{authStatus}</Text>
                            <Text UNSAFE_className="text-sm text-gray-600">
                                Please complete sign-in in your browser
                            </Text>
                        </Flex>
                    </Flex>
                </Well>
            )}

            {!state.adobeAuth.isChecking && state.adobeAuth.isAuthenticated && (
                <Well>
                    <Flex direction="column" gap="size-100">
                        <Flex gap="size-200" alignItems="center">
                            <CheckmarkCircle UNSAFE_className="text-green-600" />
                            <Text><strong>Authenticated</strong></Text>
                        </Flex>
                        {state.adobeOrg && (
                            <Text UNSAFE_className="text-sm">
                                Organization: <strong>{state.adobeOrg.name}</strong>
                            </Text>
                        )}
                    </Flex>
                </Well>
            )}

            {!state.adobeAuth.isChecking && !state.adobeAuth.isAuthenticated && (
                <Well>
                    <Flex gap="size-200" alignItems="center">
                        <AlertCircle UNSAFE_className="text-yellow-600" />
                        <Flex direction="column" gap="size-50">
                            <Text><strong>Authentication Required</strong></Text>
                            <Text UNSAFE_className="text-sm text-gray-700">
                                {state.adobeAuth.error || 'Please sign in to continue'}
                            </Text>
                        </Flex>
                    </Flex>
                </Well>
            )}

            {/* Action Buttons */}
            {!state.adobeAuth.isAuthenticated && !state.adobeAuth.isChecking && (
                <Button
                    variant="accent"
                    onPress={() => handleLogin(false)}
                    marginTop="size-300"
                >
                    Sign In with Adobe
                </Button>
            )}

            {state.adobeAuth.isAuthenticated && state.adobeOrg && (
                <Button
                    variant="secondary"
                    onPress={() => handleLogin(true)}
                    marginTop="size-200"
                >
                    Switch to Different Organization
                </Button>
            )}
        </div>
    );
}