import Alert from '@spectrum-icons/workflow/Alert';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import Key from '@spectrum-icons/workflow/Key';
import Login from '@spectrum-icons/workflow/Login';
import Refresh from '@spectrum-icons/workflow/Refresh';
import React from 'react';
import { useAuthStatus } from '../hooks/useAuthStatus';
import { getOrgSelectionMessage } from './authHelpers';
import {
    isTokenExpiringSoon,
    isAuthenticatedWithOrg,
    needsOrgSelection,
    isNotAuthenticated,
    hasAuthError,
    hasAuthTimeout,
} from './authPredicates';
import { AuthLoadingState } from './components/AuthLoadingState';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { ErrorCode } from '@/types/errorCodes';
import { BaseStepProps } from '@/types/wizard';

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
            {/* Loading state */}
            {(showLoadingSpinner || adobeAuth.isAuthenticated === undefined) && !authTimeout && (
                <AuthLoadingState
                    message={authStatus || 'Connecting to Adobe services...'}
                    subMessage={authSubMessage}
                    helperText="This could take up to 1 minute"
                />
            )}

            {/* Token expiring soon */}
            {isTokenExpiringSoon(adobeAuth) && (
                <StatusDisplay
                    variant="warning"
                    icon={<Alert className="text-orange-500" size="L" />}
                    title="Session Expiring Soon"
                    message={`Your Adobe session expires in ${adobeAuth.tokenExpiresIn || 0} ${adobeAuth.tokenExpiresIn === 1 ? 'minute' : 'minutes'}. Please re-authenticate to avoid interruption during project setup.`}
                    centerMessage
                    maxWidth="450px"
                    actions={[
                        { label: 'Re-authenticate Now', icon: <Login size="S" />, variant: 'accent', onPress: () => handleLogin(true) },
                    ]}
                />
            )}

            {/* Authenticated with valid organization */}
            {isAuthenticatedWithOrg(adobeAuth, adobeOrg) && adobeOrg && (
                <StatusDisplay
                    variant="success"
                    title="Connected"
                    message={adobeOrg.name}
                    actions={[
                        { label: 'Switch Organizations', variant: 'secondary', onPress: () => handleLogin(true) },
                    ]}
                />
            )}

            {/* Authenticated but organization selection required */}
            {needsOrgSelection(adobeAuth, adobeOrg) && (
                <StatusDisplay
                    variant="warning"
                    icon={<AlertCircle className="text-orange-500" size="L" />}
                    title="Select Your Organization"
                    message={getOrgSelectionMessage(adobeAuth)}
                    centerMessage
                    maxWidth="450px"
                    actions={[
                        { label: 'Select Organization', icon: <Key size="S" />, variant: 'accent', onPress: () => handleLogin(true) },
                    ]}
                />
            )}

            {/* Not authenticated */}
            {isNotAuthenticated(adobeAuth, authTimeout) && (
                <StatusDisplay
                    variant="info"
                    icon={<Key className="text-gray-500" size="L" />}
                    title={authStatus || 'Sign in to Adobe'}
                    message={authSubMessage || 'Connect your Adobe account to create and deploy App Builder applications.'}
                    centerMessage
                    maxWidth="450px"
                    actions={[
                        { label: 'Sign In with Adobe', icon: <Login size="S" />, variant: 'accent', onPress: () => handleLogin(false) },
                    ]}
                />
            )}

            {/* Error state */}
            {hasAuthError(adobeAuth, authTimeout) && (
                <StatusDisplay
                    variant={adobeAuth.code === ErrorCode.AUTH_NO_APP_BUILDER ? 'warning' : 'error'}
                    icon={adobeAuth.code === ErrorCode.AUTH_NO_APP_BUILDER
                        ? <AlertCircle className="text-orange-500" size="L" />
                        : <Alert className="text-red-500" size="L" />
                    }
                    title={adobeAuth.code === ErrorCode.AUTH_NO_APP_BUILDER ? 'Insufficient Privileges' : 'Connection Issue'}
                    message={authSubMessage || (adobeAuth.code === ErrorCode.AUTH_NO_APP_BUILDER
                        ? 'You need Developer or System Admin role in an Adobe organization with App Builder access.'
                        : "We couldn't connect to Adobe services. Please check your internet connection.")}
                    centerMessage
                    maxWidth="450px"
                    actions={adobeAuth.code === ErrorCode.AUTH_NO_APP_BUILDER
                        ? [{ label: 'Sign In Again', icon: <Login size="S" />, variant: 'accent', onPress: () => handleLogin(true) }]
                        : [
                            { label: 'Try Again', icon: <Refresh size="S" />, variant: 'secondary', onPress: () => checkAuthentication() },
                            { label: 'Sign In Again', icon: <Login size="S" />, variant: 'accent', onPress: () => handleLogin(false) },
                        ]
                    }
                />
            )}

            {/* Timeout state */}
            {hasAuthTimeout(adobeAuth, authTimeout) && (
                <StatusDisplay
                    variant="error"
                    icon={<Alert className="text-red-500" size="L" />}
                    title="Authentication Timed Out"
                    message="The browser authentication window may have been closed or the session expired."
                    centerMessage
                    maxWidth="450px"
                    actions={[
                        { label: 'Retry Login', icon: <Login size="S" />, variant: 'accent', onPress: () => handleLogin(false) },
                    ]}
                />
            )}
        </SingleColumnLayout>
    );
}
