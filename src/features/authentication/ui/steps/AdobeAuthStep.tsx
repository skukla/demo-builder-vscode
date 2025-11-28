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
import { ErrorCode } from '@/types/errorCodes';
import { BaseStepProps } from '@/types/wizard';
import { useAuthStatus } from '../hooks/useAuthStatus';
import {
    isTokenExpiringSoon,
    isAuthenticatedWithOrg,
    needsOrgSelection,
    isNotAuthenticated,
    hasAuthError,
    hasAuthTimeout,
} from './authPredicates';
import { getOrgSelectionMessage } from './authHelpers';

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
            {isTokenExpiringSoon(adobeAuth) && (
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
            {isAuthenticatedWithOrg(adobeAuth, adobeOrg) && (
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
            {needsOrgSelection(adobeAuth, adobeOrg) && (
                <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                    <Flex direction="column" gap="size-200" alignItems="center">
                        <AlertCircle UNSAFE_className="text-orange-500" size="L" />
                        <Flex direction="column" gap="size-100" alignItems="center">
                            <Text UNSAFE_className="text-xl font-medium">Select Your Organization</Text>
                            <Text UNSAFE_className="text-sm text-gray-600 text-center" UNSAFE_style={{ maxWidth: '450px' }}>
                                {getOrgSelectionMessage(adobeAuth)}
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
            {isNotAuthenticated(adobeAuth, authTimeout) && (
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
            {hasAuthError(adobeAuth, authTimeout) && (
                <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                    <Flex direction="column" gap="size-200" alignItems="center">
                        {adobeAuth.code === ErrorCode.AUTH_NO_APP_BUILDER ? (
                            <AlertCircle UNSAFE_className="text-orange-500" size="L" />
                        ) : (
                            <Alert UNSAFE_className="text-red-500" size="L" />
                        )}
                        <Flex direction="column" gap="size-100" alignItems="center">
                            <Text UNSAFE_className="text-xl font-medium">
                                {adobeAuth.code === ErrorCode.AUTH_NO_APP_BUILDER ? 'Insufficient Privileges' : 'Connection Issue'}
                            </Text>
                            <Text UNSAFE_className="text-sm text-gray-600 text-center" UNSAFE_style={{ maxWidth: '450px' }}>
                                {authSubMessage || (adobeAuth.code === ErrorCode.AUTH_NO_APP_BUILDER
                                    ? "You need Developer or System Admin role in an Adobe organization with App Builder access."
                                    : "We couldn't connect to Adobe services. Please check your internet connection.")}
                            </Text>
                        </Flex>
                        <Flex direction="row" gap="size-200" marginTop="size-300">
                            {adobeAuth.code === ErrorCode.AUTH_NO_APP_BUILDER ? (
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
            {hasAuthTimeout(adobeAuth, authTimeout) && (
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
