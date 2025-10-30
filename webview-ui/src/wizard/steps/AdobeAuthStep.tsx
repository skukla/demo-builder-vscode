import React, { useEffect, useState, useRef } from 'react';
import {
    Flex,
    Heading,
    Text,
    Button
} from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import Alert from '@spectrum-icons/workflow/Alert';
import Key from '@spectrum-icons/workflow/Key';
import Login from '@spectrum-icons/workflow/Login';
import Refresh from '@spectrum-icons/workflow/Refresh';
import { WizardState } from '@/webview-ui/shared/types';
import { webviewClient } from '@/webview-ui/shared/utils/WebviewClient';
import { useMinimumLoadingTime } from '@/hooks';
import { LoadingDisplay } from '@/webview-ui/shared/components/feedback/LoadingDisplay';

interface AdobeAuthStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
}

export function AdobeAuthStep({ state, updateState, setCanProceed }: AdobeAuthStepProps) {
    const [authStatus, setAuthStatus] = useState<string>('');
    const [authSubMessage, setAuthSubMessage] = useState<string>('');
    const [authTimeout, setAuthTimeout] = useState(false);
    const isSwitchingRef = useRef(false);
    const authTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    // Ensure loading spinner shows for minimum 500ms to avoid looking like a bug
    const showLoadingSpinner = useMinimumLoadingTime(state.adobeAuth.isChecking, 500);

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
        const unsubscribe = webviewClient.onMessage('auth-status', (data) => {
            const authData = data as any;

            // Clear timeout on any auth status update
            if (authTimeoutRef.current) {
                clearTimeout(authTimeoutRef.current);
                authTimeoutRef.current = null;
            }

            // Check if this is a timeout error
            if (authData.error === 'timeout') {
                setAuthTimeout(true);
                updateState({
                    adobeAuth: {
                        ...state.adobeAuth,
                        isChecking: false,
                        error: 'timeout'
                    }
                });
                setAuthStatus(authData.message || '');
                setAuthSubMessage(authData.subMessage || '');
                return;
            }

            // Reset the switching flag when authentication completes
            if (authData.isAuthenticated && isSwitchingRef.current) {
                isSwitchingRef.current = false;
            }

            // Clear timeout state on successful auth OR when starting a new check
            if (authData.isAuthenticated || authData.isChecking) {
                setAuthTimeout(false);
            }

            updateState({
                adobeAuth: {
                    isAuthenticated: authData.isAuthenticated,
                    isChecking: authData.isChecking !== undefined ? authData.isChecking : false,
                    email: authData.email,
                    error: authData.error,
                    requiresOrgSelection: authData.requiresOrgSelection,
                    orgLacksAccess: authData.orgLacksAccess
                },
                // Always update org - set to undefined when null/undefined
                adobeOrg: authData.organization ? {
                    id: authData.organization.id,
                    code: authData.organization.code,
                    name: authData.organization.name
                } : undefined
            });
            setAuthStatus(authData.message || '');
            setAuthSubMessage(authData.subMessage || '');
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
            return;
        }
        setAuthStatus('Checking Adobe authentication...');
        updateState({
            adobeAuth: { ...state.adobeAuth, isChecking: true }
        });
        webviewClient.postMessage('check-auth');
    };

    const handleLogin = (force: boolean = false) => {
        // Clear any existing timeout
        if (authTimeoutRef.current) {
            clearTimeout(authTimeoutRef.current);
            authTimeoutRef.current = null;
        }
        
        // Reset timeout state
        setAuthTimeout(false);
        
        // Immediately set the ref when switching orgs to prevent race conditions
        if (force) {
            isSwitchingRef.current = true;
        }
        
        // Update all state in a single call to prevent UI blips
        updateState({
            adobeAuth: { 
                ...state.adobeAuth, 
                isChecking: true,
                error: undefined,
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
        // Backend sends auth-status message immediately - no need to set here
        
        // NOTE: No frontend timeout - backend handles timeout detection
        // Backend will send auth-status with error='timeout' if authentication times out
        // This prevents race conditions where frontend timeout fires before backend completes post-login work
        
        webviewClient.requestAuth(force);
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
            {(showLoadingSpinner || state.adobeAuth.isAuthenticated === undefined) && !authTimeout && (
                <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                    <LoadingDisplay 
                        size="L"
                        helperText="This could take up to 1 minute"
                        message={authStatus || 'Connecting to Adobe services...'}
                        subMessage={authSubMessage}
                    />
                </Flex>
            )}

            {/* Authenticated with valid organization */}
            {!state.adobeAuth.isChecking && state.adobeAuth.isAuthenticated && state.adobeOrg && (
                <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                    <Flex direction="column" gap="size-200" alignItems="center">
                        <CheckmarkCircle UNSAFE_className="text-green-600" size="L" />
                        <Flex direction="column" gap="size-100" alignItems="center">
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
            {!state.adobeAuth.isChecking && state.adobeAuth.isAuthenticated && !state.adobeOrg && (
                <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                    <Flex direction="column" gap="size-200" alignItems="center">
                        <AlertCircle UNSAFE_className="text-orange-500" size="L" />
                        <Flex direction="column" gap="size-100" alignItems="center">
                            <Text UNSAFE_className="text-xl font-medium">
                                Select Your Organization
                            </Text>
                            <Text UNSAFE_className="text-sm text-gray-600 text-center" UNSAFE_style={{maxWidth: '450px'}}>
                                {state.adobeAuth.orgLacksAccess ? (
                                    <>
                                        No organizations are currently accessible. If you just selected an organization, it may lack App Builder access, or there may be a temporary authentication issue.
                                        <br />
                                        Please choose an organization with App Builder enabled.
                                    </>
                                ) : state.adobeAuth.requiresOrgSelection ? (
                                    "Your previous organization is no longer accessible. Please select a new organization to continue with your project."
                                ) : (
                                    <>
                                        You're signed in to Adobe, but haven't selected an organization yet.
                                        <br />
                                        Choose your organization to access App Builder projects.
                                    </>
                                )}
                            </Text>
                        </Flex>
                        <Button
                            variant="accent"
                            onPress={() => handleLogin(true)}
                            marginTop="size-300"
                        >
                            <Key size="S" marginEnd="size-100" />
                            Select Organization
                        </Button>
                    </Flex>
                </Flex>
            )}

            {/* Not authenticated - normal state */}
            {!state.adobeAuth.isChecking && !authTimeout && state.adobeAuth.isAuthenticated === false && !state.adobeAuth.error && (
                <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
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
                        >
                            <Login size="S" marginEnd="size-100" />
                            Sign In with Adobe
                        </Button>
                    </Flex>
                </Flex>
            )}

            {/* Error state with helpful guidance */}
            {!state.adobeAuth.isChecking && state.adobeAuth.error && !authTimeout && (
                <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                    <Flex direction="column" gap="size-200" alignItems="center">
                        {state.adobeAuth.error === 'no_app_builder_access' ? (
                            <AlertCircle UNSAFE_className="text-orange-500" size="L" />
                        ) : (
                            <Alert UNSAFE_className="text-red-500" size="L" />
                        )}
                        <Flex direction="column" gap="size-100" alignItems="center">
                            <Text UNSAFE_className="text-xl font-medium">
                                {state.adobeAuth.error === 'no_app_builder_access' ? 'Insufficient Privileges' : 'Connection Issue'}
                            </Text>
                            <Text UNSAFE_className="text-sm text-gray-600 text-center" UNSAFE_style={{maxWidth: '450px'}}>
                                {authSubMessage || (state.adobeAuth.error === 'no_app_builder_access'
                                    ? "You need Developer or System Admin role in an Adobe organization with App Builder access. Please contact your administrator to request the appropriate permissions."
                                    : "We couldn't connect to Adobe services. Please check your internet connection and try again.")}
                            </Text>
                        </Flex>
                        <Flex direction="row" gap="size-200" marginTop="size-300">
                            {state.adobeAuth.error === 'no_app_builder_access' ? (
                                // For permission errors, force fresh login to select different org
                                <Button variant="accent" onPress={() => handleLogin(true)}>
                                    <Login size="S" marginEnd="size-100" />
                                    Sign In Again
                                </Button>
                            ) : (
                                // For connection errors, show both retry and sign in options
                                <>
                                    <Button variant="secondary" onPress={() => checkAuthentication()}>
                                        <Refresh size="S" marginEnd="size-100" />
                                        Try Again
                                    </Button>
                                    <Button variant="accent" onPress={() => handleLogin(false)}>
                                        <Login size="S" marginEnd="size-100" />
                                        Sign In Again
                                    </Button>
                                </>
                            )}
                        </Flex>
                    </Flex>
                </Flex>
            )}

            {/* Timeout state - similar to error but with specific messaging */}
            {authTimeout && !state.adobeAuth.isChecking && !state.adobeAuth.isAuthenticated && (
                <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                    <Flex direction="column" gap="size-200" alignItems="center">
                        <Alert UNSAFE_className="text-red-500" size="L" />
                        <Flex direction="column" gap="size-100" alignItems="center">
                            <Text UNSAFE_className="text-xl font-medium">
                                Authentication Timed Out
                            </Text>
                            <Text UNSAFE_className="text-sm text-gray-600 text-center" UNSAFE_style={{maxWidth: '450px'}}>
                                The browser authentication window may have been closed or the session expired. You can try again.
                            </Text>
                        </Flex>
                        <Button variant="accent" onPress={() => {
                            // Clear timeout immediately to prevent flash during state transition
                            setAuthTimeout(false);
                            handleLogin(false);
                        }} marginTop="size-300">
                            <Login size="S" marginEnd="size-100" />
                            Retry Login
                        </Button>
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