import { useEffect, useState, useRef, useCallback } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import { WizardState } from '@/types/webview';

const log = webviewLogger('useAuthStatus');

interface AuthStatusData {
    message?: string;
    subMessage?: string;
    error?: string;
    isAuthenticated: boolean;
    isChecking?: boolean;
    email?: string;
    requiresOrgSelection?: boolean;
    orgLacksAccess?: boolean;
    tokenExpiresIn?: number;
    tokenExpiringSoon?: boolean;
    organization?: {
        id: string;
        code: string;
        name: string;
    };
}

interface UseAuthStatusProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
}

interface UseAuthStatusReturn {
    authStatus: string;
    authSubMessage: string;
    authTimeout: boolean;
    showLoadingSpinner: boolean;
    checkAuthentication: () => void;
    handleLogin: (force?: boolean) => void;
}

export function useAuthStatus({
    state,
    updateState,
    setCanProceed,
}: UseAuthStatusProps): UseAuthStatusReturn {
    const [authStatus, setAuthStatus] = useState<string>('');
    const [authSubMessage, setAuthSubMessage] = useState<string>('');
    const [authTimeout, setAuthTimeout] = useState(false);
    const isSwitchingRef = useRef(false);
    const authTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const showLoadingSpinner = state.adobeAuth.isChecking;

    const checkAuthentication = useCallback(() => {
        if (isSwitchingRef.current || state.adobeAuth.isChecking) {
            log.debug('Skipping auth check - switching org or already checking');
            return;
        }
        setAuthStatus('Checking Adobe authentication...');
        updateState({
            adobeAuth: { ...state.adobeAuth, isChecking: true },
        });
        webviewClient.postMessage('check-auth');
    }, [state.adobeAuth, updateState]);

    const handleLogin = useCallback((force: boolean = false) => {
        if (authTimeoutRef.current) {
            clearTimeout(authTimeoutRef.current);
            authTimeoutRef.current = null;
        }

        setAuthTimeout(false);
        setAuthStatus('');
        setAuthSubMessage('');

        if (force) {
            isSwitchingRef.current = true;
        }

        updateState({
            adobeAuth: {
                ...state.adobeAuth,
                isChecking: true,
                error: undefined,
            },
            ...(force && {
                adobeOrg: undefined,
                adobeProject: undefined,
                adobeWorkspace: undefined,
            }),
        });

        webviewClient.requestAuth(force);
    }, [state.adobeAuth, updateState]);

    // Check authentication on mount
    useEffect(() => {
        checkAuthentication();

        const unsubscribe = webviewClient.onMessage('auth-status', (data) => {
            const authData = data as AuthStatusData;

            log.debug('Auth status received:', authData);

            if (authTimeoutRef.current) {
                clearTimeout(authTimeoutRef.current);
                authTimeoutRef.current = null;
            }

            if (authData.error === 'timeout') {
                setAuthTimeout(true);
                updateState({
                    adobeAuth: {
                        ...state.adobeAuth,
                        isChecking: false,
                        error: 'timeout',
                    },
                });
                setAuthStatus(authData.message || '');
                setAuthSubMessage(authData.subMessage || '');
                return;
            }

            if (authData.isAuthenticated && isSwitchingRef.current) {
                isSwitchingRef.current = false;
            }

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
                    orgLacksAccess: authData.orgLacksAccess,
                    tokenExpiresIn: authData.tokenExpiresIn,
                    tokenExpiringSoon: authData.tokenExpiringSoon,
                },
                adobeOrg: authData.organization ? {
                    id: authData.organization.id,
                    code: authData.organization.code,
                    name: authData.organization.name,
                } : undefined,
            });
            setAuthStatus(authData.message || '');
            setAuthSubMessage(authData.subMessage || '');
        });

        return unsubscribe;
    }, []);

    // Update canProceed based on auth state
    useEffect(() => {
        setCanProceed(
            state.adobeAuth.isAuthenticated &&
            !!state.adobeOrg?.name &&
            !state.adobeAuth.tokenExpiringSoon
        );
    }, [state.adobeAuth.isAuthenticated, state.adobeAuth.tokenExpiringSoon, state.adobeOrg, setCanProceed]);

    return {
        authStatus,
        authSubMessage,
        authTimeout,
        showLoadingSpinner,
        checkAuthentication,
        handleLogin,
    };
}
