import React, { useEffect, useState, useRef } from 'react';
import {
    Flex,
    Heading,
    Text,
    Button,
    ProgressCircle,
    View
} from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import Alert from '@spectrum-icons/workflow/Alert';
import Key from '@spectrum-icons/workflow/Key';
import Login from '@spectrum-icons/workflow/Login';
import Refresh from '@spectrum-icons/workflow/Refresh';
import { WizardState } from '../../types';
import { vscode } from '../../app/vscodeApi';
import { LoadingDisplay } from '../shared/LoadingDisplay';
import { useDebouncedLoading } from '../../utils/useDebouncedLoading';

interface AdobeAuthStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
}

export function AdobeAuthStep({ state, updateState, setCanProceed }: AdobeAuthStepProps) {
    const [authStatus, setAuthStatus] = useState<string>('');
    const [authSubMessage, setAuthSubMessage] = useState<string>('');
    const isSwitchingRef = useRef(false);
    
    // Debounce loading state: only show checking UI if operation takes >300ms
    // This prevents flash of loading messages for fast SDK-based auth checks
    const showChecking = useDebouncedLoading(state.adobeAuth.isChecking);

    useEffect(() => {
        // Only check authentication if status is unknown (undefined) or explicitly failed
        // Don't re-check if already authenticated - prevents unnecessary flickering when navigating back
        if (!state.adobeAuth.isChecking && state.adobeAuth.isAuthenticated === undefined) {
            checkAuthentication();
        } else if (state.adobeAuth.isAuthenticated && state.adobeOrg) {
            // If already authenticated on mount, clear any stale messages
            // This prevents "left over" feeling when navigating back to this step
            setAuthStatus('');
            setAuthSubMessage('');
        }

        // Listen for auth status updates
        const unsubscribe = vscode.onMessage('auth-status', (data) => {
            // Debug logging to see what we're receiving
            console.log('Auth status received:', data);
            console.log('Message:', data.message);
            console.log('SubMessage:', data.subMessage);

            // Reset the switching flag when authentication completes
            if (data.isAuthenticated && isSwitchingRef.current) {
                isSwitchingRef.current = false;
            }

            updateState({
                adobeAuth: {
                    isAuthenticated: data.isAuthenticated,
                    isChecking: data.isChecking !== undefined ? data.isChecking : false,
                    email: data.email,
                    error: data.error,
                    requiresOrgSelection: data.requiresOrgSelection
                },
                // Always update org - set to undefined when null/undefined
                adobeOrg: data.organization ? {
                    id: data.organization.id,
                    code: data.organization.code,
                    name: data.organization.name
                } : undefined
            });
            setAuthStatus(data.message || '');
            setAuthSubMessage(data.subMessage || '');
        });

        return unsubscribe;
    }, []);

    useEffect(() => {
        // Can only proceed if authenticated AND has organization selected
        setCanProceed(state.adobeAuth.isAuthenticated && !!state.adobeOrg?.name);
    }, [state.adobeAuth.isAuthenticated, state.adobeOrg, setCanProceed]);

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
                // Keep isAuthenticated as-is - we're switching orgs, not logging out
                // The checking state will show appropriate loading UI
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

            {/* Authentication Status - Checking (or not yet checked) */}
            {(showChecking || state.adobeAuth.isAuthenticated === undefined) && (
                <Flex direction="column" justifyContent="center" alignItems="center" height="400px">
                    <View marginBottom="size-200">
                        <ProgressCircle size="L" isIndeterminate />
                    </View>
                    <Flex direction="column" gap="size-50" alignItems="center">
                        <Text UNSAFE_className="text-lg font-medium">
                            {authStatus || 'Connecting to Adobe services...'}
                        </Text>
                        {authSubMessage && (
                            <Text UNSAFE_className="text-sm text-gray-500 text-center" UNSAFE_style={{maxWidth: '400px'}}>
                                {authSubMessage}
                            </Text>
                        )}
                    </Flex>
                </Flex>
            )}

            {/* Authenticated with valid organization */}
            {!showChecking && state.adobeAuth.isAuthenticated && state.adobeOrg && (
                <Flex direction="column" justifyContent="center" alignItems="center" height="400px">
                    <Flex direction="column" gap="size-200" alignItems="center">
                        <CheckmarkCircle UNSAFE_className="text-green-600" size="L" />
                        <Flex direction="column" gap="size-50" alignItems="center">
                            <Text UNSAFE_className="text-lg font-medium">
                                Connected
                            </Text>
                            <Text UNSAFE_className="text-sm text-gray-600">
                                {state.adobeOrg.name}
                            </Text>
                        </Flex>
                        <Button
                            variant="secondary"
                            onPress={() => handleLogin(true)}
                            marginTop="size-200"
                        >
                            Switch Organizations
                        </Button>
                    </Flex>
                </Flex>
            )}

            {/* Authenticated but organization selection required */}
            {!showChecking && state.adobeAuth.isAuthenticated && !state.adobeOrg && (
                <Flex direction="column" justifyContent="center" alignItems="center" height="400px">
                    <Flex direction="column" gap="size-200" alignItems="center">
                        <AlertCircle UNSAFE_className="text-orange-500" size="L" />
                        <Flex direction="column" gap="size-100" alignItems="center">
                            <Text UNSAFE_className="text-xl font-medium">
                                Select Your Organization
                            </Text>
                            <Text UNSAFE_className="text-sm text-gray-600 text-center" UNSAFE_style={{maxWidth: '450px'}}>
                                {state.adobeAuth.requiresOrgSelection
                                    ? "Your previous organization is no longer accessible. Please select a new organization to continue with your project."
                                    : "You're signed in to Adobe, but haven't selected an organization yet. Choose your organization to access App Builder projects."}
                            </Text>
                        </Flex>
                        <Button
                            variant="accent"
                            onPress={() => handleLogin(true)}
                            marginTop="size-300"
                            size="L"
                        >
                            <Key size="S" marginEnd="size-100" />
                            Select Organization
                        </Button>
                    </Flex>
                </Flex>
            )}

            {/* Not authenticated - normal state */}
            {!showChecking && state.adobeAuth.isAuthenticated === false && !state.adobeAuth.error && (
                <Flex direction="column" justifyContent="center" alignItems="center" height="400px">
                    <Flex direction="column" gap="size-200" alignItems="center">
                        <Key UNSAFE_className="text-gray-500" size="L" />
                        <Flex direction="column" gap="size-100" alignItems="center">
                            <Text UNSAFE_className="text-xl font-medium">
                                {authStatus || 'Sign in to Adobe'}
                            </Text>
                            <Text UNSAFE_className="text-sm text-gray-600 text-center" UNSAFE_style={{maxWidth: '450px'}}>
                                {authSubMessage || "Connect your Adobe account to create and deploy App Builder applications. You'll be redirected to sign in through your browser."}
                            </Text>
                        </Flex>
                        <Button
                            variant="accent"
                            onPress={() => handleLogin(false)}
                            marginTop="size-300"
                            size="L"
                        >
                            <Login size="S" marginEnd="size-100" />
                            Sign In with Adobe
                        </Button>
                    </Flex>
                </Flex>
            )}

            {/* Error state with helpful guidance */}
            {!showChecking && state.adobeAuth.error && (
                <Flex direction="column" justifyContent="center" alignItems="center" height="400px">
                    <Flex direction="column" gap="size-200" alignItems="center">
                        <Alert UNSAFE_className="text-red-500" size="L" />
                        <Flex direction="column" gap="size-100" alignItems="center">
                            <Text UNSAFE_className="text-xl font-medium">
                                Connection Issue
                            </Text>
                            <Text UNSAFE_className="text-sm text-gray-600 text-center" UNSAFE_style={{maxWidth: '450px'}}>
                                {authSubMessage || "We couldn't connect to Adobe services. Please check your internet connection and try again."}
                            </Text>
                        </Flex>
                        <Flex direction="row" gap="size-200" marginTop="size-300">
                            <Button variant="secondary" onPress={() => checkAuthentication()}>
                                <Refresh size="S" marginEnd="size-100" />
                                Try Again
                            </Button>
                            <Button variant="accent" onPress={() => handleLogin(false)}>
                                <Login size="S" marginEnd="size-100" />
                                Sign In Again
                            </Button>
                        </Flex>
                    </Flex>
                </Flex>
            )}

            <style>{`
                .text-center {
                    text-align: center;
                }
            `}</style>
        </div>
    );
}