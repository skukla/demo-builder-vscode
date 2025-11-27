import {
    Flex,
    Heading,
    Text,
    Button,
} from '@adobe/react-spectrum';
import Alert from '@spectrum-icons/workflow/Alert';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Key from '@spectrum-icons/workflow/Key';
import Login from '@spectrum-icons/workflow/Login';
import Refresh from '@spectrum-icons/workflow/Refresh';
import React from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { BaseStepProps } from '@/types/wizard';
import { useAuthStatus } from '../hooks/useAuthStatus';

export function AdobeAuthStep({ state, updateState, setCanProceed }: BaseStepProps) {
    const {
        authStatus,
        authSubMessage,
        authTimeout,
        showLoadingSpinner,
        checkAuthentication,
        handleLogin,
    } = useAuthStatus({ state, updateState, setCanProceed });

    const { adobeAuth, adobeOrg } = state;

    return (
        <SingleColumnLayout>
            <Heading level={2} marginBottom="size-300">
                Adobe Authentication
            </Heading>

            <Text marginBottom="size-400">
                We need to authenticate with Adobe to deploy your API Mesh and access Adobe services.
            </Text>

            {/* Loading state */}
            {(showLoadingSpinner || adobeAuth.isAuthenticated === undefined) && !authTimeout && (
                <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                    <LoadingDisplay
                        size="L"
                        helperText="This could take up to 1 minute"
                        message={authStatus || 'Connecting to Adobe services...'}
                        subMessage={authSubMessage}
                    />
                </Flex>
            )}

            {/* Token expiring soon */}
            {!adobeAuth.isChecking && adobeAuth.isAuthenticated && adobeAuth.tokenExpiringSoon && (
                <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                    <Flex direction="column" gap="size-200" alignItems="center">
                        <Alert UNSAFE_className="text-orange-500" size="L" />
                        <Flex direction="column" gap="size-100" alignItems="center">
                            <Text UNSAFE_className="text-xl font-medium">Session Expiring Soon</Text>
                            <Text UNSAFE_className="text-sm text-gray-600 text-center" UNSAFE_style={{ maxWidth: '450px' }}>
                                Your Adobe session expires in {adobeAuth.tokenExpiresIn || 0} {adobeAuth.tokenExpiresIn === 1 ? 'minute' : 'minutes'}. Please re-authenticate to avoid interruption during project setup.
                            </Text>
                        </Flex>
                        <Button variant="accent" onPress={() => handleLogin(true)} marginTop="size-300">
                            <Login size="S" marginEnd="size-100" />
                            Re-authenticate Now
                        </Button>
                    </Flex>
                </Flex>
            )}

            {/* Authenticated with valid organization */}
            {!adobeAuth.isChecking && adobeAuth.isAuthenticated && adobeOrg && !adobeAuth.tokenExpiringSoon && (
                <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                    <Flex direction="column" gap="size-200" alignItems="center">
                        <CheckmarkCircle UNSAFE_className="text-green-600" size="L" />
                        <Flex direction="column" gap="size-100" alignItems="center">
                            <Text UNSAFE_className="text-lg font-medium">Connected</Text>
                            <Text UNSAFE_className="text-sm text-gray-600">{adobeOrg.name}</Text>
                        </Flex>
                        <Button variant="secondary" onPress={() => handleLogin(true)} marginTop="size-200">
                            Switch Organizations
                        </Button>
                    </Flex>
                </Flex>
            )}

            {/* Authenticated but organization selection required */}
            {!adobeAuth.isChecking && adobeAuth.isAuthenticated && !adobeOrg && (
                <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                    <Flex direction="column" gap="size-200" alignItems="center">
                        <AlertCircle UNSAFE_className="text-orange-500" size="L" />
                        <Flex direction="column" gap="size-100" alignItems="center">
                            <Text UNSAFE_className="text-xl font-medium">Select Your Organization</Text>
                            <Text UNSAFE_className="text-sm text-gray-600 text-center" UNSAFE_style={{ maxWidth: '450px' }}>
                                {adobeAuth.orgLacksAccess ? (
                                    <>No organizations are currently accessible. Please choose an organization with App Builder enabled.</>
                                ) : adobeAuth.requiresOrgSelection ? (
                                    "Your previous organization is no longer accessible. Please select a new organization."
                                ) : (
                                    <>You're signed in to Adobe, but haven't selected an organization yet.</>
                                )}
                            </Text>
                        </Flex>
                        <Button variant="accent" onPress={() => handleLogin(true)} marginTop="size-300">
                            <Key size="S" marginEnd="size-100" />
                            Select Organization
                        </Button>
                    </Flex>
                </Flex>
            )}

            {/* Not authenticated */}
            {!adobeAuth.isChecking && !authTimeout && adobeAuth.isAuthenticated === false && !adobeAuth.error && (
                <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                    <Flex direction="column" gap="size-200" alignItems="center">
                        <Key UNSAFE_className="text-gray-500" size="L" />
                        <Flex direction="column" gap="size-100" alignItems="center">
                            <Text UNSAFE_className="text-xl font-medium">{authStatus || 'Sign in to Adobe'}</Text>
                            <Text UNSAFE_className="text-sm text-gray-600 text-center" UNSAFE_style={{ maxWidth: '450px' }}>
                                {authSubMessage || "Connect your Adobe account to create and deploy App Builder applications."}
                            </Text>
                        </Flex>
                        <Button variant="accent" onPress={() => handleLogin(false)} marginTop="size-300">
                            <Login size="S" marginEnd="size-100" />
                            Sign In with Adobe
                        </Button>
                    </Flex>
                </Flex>
            )}

            {/* Error state */}
            {!adobeAuth.isChecking && adobeAuth.error && !authTimeout && (
                <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                    <Flex direction="column" gap="size-200" alignItems="center">
                        {adobeAuth.error === 'no_app_builder_access' ? (
                            <AlertCircle UNSAFE_className="text-orange-500" size="L" />
                        ) : (
                            <Alert UNSAFE_className="text-red-500" size="L" />
                        )}
                        <Flex direction="column" gap="size-100" alignItems="center">
                            <Text UNSAFE_className="text-xl font-medium">
                                {adobeAuth.error === 'no_app_builder_access' ? 'Insufficient Privileges' : 'Connection Issue'}
                            </Text>
                            <Text UNSAFE_className="text-sm text-gray-600 text-center" UNSAFE_style={{ maxWidth: '450px' }}>
                                {authSubMessage || (adobeAuth.error === 'no_app_builder_access'
                                    ? "You need Developer or System Admin role in an Adobe organization with App Builder access."
                                    : "We couldn't connect to Adobe services. Please check your internet connection.")}
                            </Text>
                        </Flex>
                        <Flex direction="row" gap="size-200" marginTop="size-300">
                            {adobeAuth.error === 'no_app_builder_access' ? (
                                <Button variant="accent" onPress={() => handleLogin(true)}>
                                    <Login size="S" marginEnd="size-100" />
                                    Sign In Again
                                </Button>
                            ) : (
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

            {/* Timeout state */}
            {authTimeout && !adobeAuth.isChecking && !adobeAuth.isAuthenticated && (
                <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                    <Flex direction="column" gap="size-200" alignItems="center">
                        <Alert UNSAFE_className="text-red-500" size="L" />
                        <Flex direction="column" gap="size-100" alignItems="center">
                            <Text UNSAFE_className="text-xl font-medium">Authentication Timed Out</Text>
                            <Text UNSAFE_className="text-sm text-gray-600 text-center" UNSAFE_style={{ maxWidth: '450px' }}>
                                The browser authentication window may have been closed or the session expired.
                            </Text>
                        </Flex>
                        <Button variant="accent" onPress={() => handleLogin(false)} marginTop="size-300">
                            <Login size="S" marginEnd="size-100" />
                            Retry Login
                        </Button>
                    </Flex>
                </Flex>
            )}

            <style>{`.text-center { text-align: center; }`}</style>
        </SingleColumnLayout>
    );
}
