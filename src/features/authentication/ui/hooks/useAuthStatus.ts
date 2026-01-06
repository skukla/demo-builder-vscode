import { useEffect, useState, useRef, useCallback } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import { ErrorCode } from '@/types/errorCodes';
import { canProceedFromAuth } from '@/types/typeGuards';
import { WizardState } from '@/types/webview';

const log = webviewLogger('useAuthStatus');

interface AuthStatusData {
    message?: string;
    subMessage?: string;
    error?: string;
    code?: ErrorCode;  // Typed error code for programmatic handling
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

    // Track org ID before re-auth to detect if it changes
    // This allows us to preserve project/workspace when re-authenticating with same org
    const preAuthOrgIdRef = useRef<string | undefined>(undefined);

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
            // Save current org ID to detect if it changes after re-auth
            // This preserves project/workspace when re-authenticating with same org
            preAuthOrgIdRef.current = state.adobeOrg?.id;
        }

        updateState({
            adobeAuth: {
                ...state.adobeAuth,
                isChecking: true,
                error: undefined,
            },
            // Don't clear org/project/workspace here - auth-status handler
            // will clear them only if the org actually changes
        });

        webviewClient.requestAuth(force);
    }, [state.adobeAuth, state.adobeOrg?.id, updateState]);

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

            // Check for timeout using typed error code
            if (authData.code === ErrorCode.TIMEOUT) {
                setAuthTimeout(true);
                updateState({
                    adobeAuth: {
                        ...state.adobeAuth,
                        isChecking: false,
                        error: authData.error || 'timeout',
                        code: authData.code,
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

            // Check if org changed after auth
            // Clear project/workspace if authenticated org differs from:
            // 1. Pre-auth org (for re-auth scenario)
            // 2. Imported/initial org in state (for first auth with imported settings)
            // IMPORTANT: Only compare when we have an actual newOrgId (auth complete)
            // Skip comparison when newOrgId is undefined (still checking)
            const newOrgId = authData.organization?.id;
            const previousOrgId = preAuthOrgIdRef.current ?? state.adobeOrg?.id;
            const orgChanged = newOrgId !== undefined &&
                               previousOrgId !== undefined &&
                               previousOrgId !== newOrgId;

            if (previousOrgId !== undefined) {
                log.debug('Auth org comparison:', {
                    previousOrgId,
                    newOrgId,
                    orgChanged,
                    willClearProject: orgChanged,
                    source: preAuthOrgIdRef.current !== undefined ? 'pre-auth-ref' : 'state',
                });
            }

            // Clear the ref after comparison
            preAuthOrgIdRef.current = undefined;

            updateState({
                adobeAuth: {
                    isAuthenticated: authData.isAuthenticated,
                    isChecking: authData.isChecking !== undefined ? authData.isChecking : false,
                    email: authData.email,
                    error: authData.error,
                    code: authData.code,  // Pass through typed error code
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
                // Only clear dependent state if org actually changed
                // Project/workspace/mesh form a cascade: org → project → workspace → mesh
                ...(orgChanged && {
                    adobeProject: undefined,
                    adobeWorkspace: undefined,
                    apiMesh: undefined,
                }),
            });
            setAuthStatus(authData.message || '');
            setAuthSubMessage(authData.subMessage || '');
        });

        return unsubscribe;
    }, []);

    // Update canProceed based on auth state
    // SOP §10: Uses canProceedFromAuth helper for 3-condition validation chain
    useEffect(() => {
        setCanProceed(
            canProceedFromAuth(
                state.adobeAuth.isAuthenticated,
                state.adobeOrg,
                state.adobeAuth.tokenExpiringSoon,
            ),
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
