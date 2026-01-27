/**
 * useDaLiveAuth Hook
 *
 * Manages DA.live authentication state for EDS wizard steps.
 * Uses a bookmarklet-based token extraction flow since DA.live OAuth
 * only supports redirects to da.live domain.
 *
 * Flow:
 * 1. User clicks "Sign In" → Opens da.live in browser
 * 2. User runs bookmarklet on da.live → Copies token from modal
 * 3. User pastes token in VS Code → Token validated and stored
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import type { WizardState, EDSConfig } from '@/types/webview';

const log = webviewLogger('useDaLiveAuth');

/**
 * DA.live auth status message data
 */
interface DaLiveAuthStatusData {
    isAuthenticated: boolean;
    error?: string;
    /** Whether user has completed bookmarklet setup before */
    setupComplete?: boolean;
    /** Cached org name from previous successful verification */
    orgName?: string;
    /** Bookmarklet URL for token extraction (provided eagerly) */
    bookmarkletUrl?: string;
}

/**
 * DA.live login opened message data
 */
interface DaLiveLoginOpenedData {
    bookmarkletUrl: string;
}

/**
 * DA.live token stored message data
 */
interface DaLiveTokenStoredData {
    success: boolean;
    error?: string;
}

/**
 * DA.live token with org result message data
 */
interface DaLiveTokenWithOrgResultData {
    success: boolean;
    error?: string;
    email?: string;
    orgName?: string;
}

/**
 * Props for useDaLiveAuth hook
 */
interface UseDaLiveAuthProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
}

/**
 * Return type for useDaLiveAuth hook
 */
interface UseDaLiveAuthReturn {
    /** Whether user is authenticated with DA.live */
    isAuthenticated: boolean;
    /** Whether auth flow is in progress */
    isAuthenticating: boolean;
    /** Whether initial auth check is in progress */
    isChecking: boolean;
    /** Error message if auth failed */
    error?: string;
    /** Bookmarklet URL for token extraction */
    bookmarkletUrl?: string;
    /** Whether user has completed bookmarklet setup before */
    setupComplete: boolean;
    /** Verified org name (from combined token + org flow) */
    verifiedOrg?: string;
    /** Open DA.live for token extraction */
    openDaLive: () => void;
    /** Store pasted token (legacy - without org verification) */
    storeToken: (token: string) => void;
    /** Store token and verify org in one step (recommended) */
    storeTokenWithOrg: (token: string, orgName: string) => void;
    /** Check current auth status */
    checkAuthStatus: () => void;
    /** Reset DA.live auth (clear token and org) */
    resetAuth: () => void;
    /** Cancel current auth attempt (reset isAuthenticating without clearing token) */
    cancelAuth: () => void;
}

/**
 * Hook for managing DA.live authentication state
 */
export function useDaLiveAuth({
    state,
    updateState,
}: UseDaLiveAuthProps): UseDaLiveAuthReturn {
    // Track whether initial auth check is in progress
    const [isChecking, setIsChecking] = useState(true);

    const edsConfig = state.edsConfig;
    const daLiveAuth = edsConfig?.daLiveAuth;

    // Store bookmarklet URL in state so the step can react when it arrives
    const [bookmarkletUrl, setBookmarkletUrl] = useState<string | undefined>(undefined);

    // Track if user has completed bookmarklet setup before
    const setupCompleteRef = useRef<boolean>(false);

    /**
     * Update EDS config with new DA.live auth state
     */
    const updateDaLiveAuth = useCallback((updates: Partial<NonNullable<EDSConfig['daLiveAuth']>>) => {
        updateState({
            edsConfig: {
                ...edsConfig,
                accsHost: edsConfig?.accsHost || '',
                storeViewCode: edsConfig?.storeViewCode || '',
                customerGroup: edsConfig?.customerGroup || '',
                repoName: edsConfig?.repoName || '',
                daLiveOrg: edsConfig?.daLiveOrg || '',
                daLiveSite: edsConfig?.daLiveSite || '',
                daLiveAuth: {
                    ...daLiveAuth,
                    isAuthenticated: daLiveAuth?.isAuthenticated || false,
                    ...updates,
                },
            },
        });
    }, [edsConfig, daLiveAuth, updateState]);

    // Use refs to access latest functions/state without triggering effect re-runs
    const updateDaLiveAuthRef = useRef(updateDaLiveAuth);
    updateDaLiveAuthRef.current = updateDaLiveAuth;

    const updateStateRef = useRef(updateState);
    updateStateRef.current = updateState;

    const edsConfigRef = useRef(edsConfig);
    edsConfigRef.current = edsConfig;

    /**
     * Check current DA.live auth status
     */
    const checkAuthStatus = useCallback(() => {
        log.debug('Checking DA.live auth status');
        webviewClient.postMessage('check-dalive-auth');
    }, []);

    /**
     * Open DA.live in browser for token extraction
     */
    const openDaLive = useCallback(() => {
        log.debug('Opening DA.live for token extraction');
        updateDaLiveAuthRef.current({ isAuthenticating: true, error: undefined });
        webviewClient.postMessage('open-dalive-login');
    }, []);

    /**
     * Store pasted token (legacy - without org verification)
     */
    const storeToken = useCallback((token: string) => {
        log.debug('Storing DA.live token');
        webviewClient.postMessage('store-dalive-token', { token });
    }, []);

    /**
     * Store token and verify org in one step
     */
    const storeTokenWithOrg = useCallback((token: string, orgName: string) => {
        log.debug('Storing DA.live token with org verification:', orgName);
        updateDaLiveAuthRef.current({ isAuthenticating: true, error: undefined });
        webviewClient.postMessage('store-dalive-token-with-org', { token, orgName });
    }, []);

    /**
     * Reset DA.live auth (clear token and org)
     */
    const resetAuth = useCallback(() => {
        log.debug('Resetting DA.live auth');
        // Clear auth state locally
        updateState({
            edsConfig: {
                ...edsConfig,
                accsHost: edsConfig?.accsHost || '',
                storeViewCode: edsConfig?.storeViewCode || '',
                customerGroup: edsConfig?.customerGroup || '',
                repoName: edsConfig?.repoName || '',
                daLiveOrg: '',
                daLiveSite: '',
                selectedSite: undefined,
                daLiveAuth: {
                    isAuthenticated: false,
                    isAuthenticating: false,
                    error: undefined,
                },
            },
            // Also clear the sites cache
            daLiveSitesCache: undefined,
        });
        // Tell backend to clear stored token
        webviewClient.postMessage('clear-dalive-auth');
    }, [edsConfig, updateState]);

    /**
     * Cancel current auth attempt (without clearing stored token)
     */
    const cancelAuth = useCallback(() => {
        log.debug('Cancelling DA.live auth attempt');
        updateDaLiveAuth({ isAuthenticating: false, error: undefined });
    }, [updateDaLiveAuth]);

    // Check auth status on mount and subscribe to messages (runs once)
    useEffect(() => {
        // Check status once on mount
        webviewClient.postMessage('check-dalive-auth');

        // Listen for auth status updates
        const unsubscribeStatus = webviewClient.onMessage('dalive-auth-status', (data) => {
            const authData = data as DaLiveAuthStatusData;
            log.debug('Received DA.live auth status:', authData);

            // Initial check complete
            setIsChecking(false);

            // Track setup completion status
            if (authData.setupComplete !== undefined) {
                setupCompleteRef.current = authData.setupComplete;
            }

            // Store bookmarklet URL if provided (eagerly sent with auth status)
            if (authData.bookmarkletUrl) {
                setBookmarkletUrl(authData.bookmarkletUrl);
            }

            // If backend returned cached org name, store it in edsConfig
            if (authData.isAuthenticated && authData.orgName) {
                updateStateRef.current({
                    edsConfig: {
                        ...edsConfigRef.current,
                        accsHost: edsConfigRef.current?.accsHost || '',
                        storeViewCode: edsConfigRef.current?.storeViewCode || '',
                        customerGroup: edsConfigRef.current?.customerGroup || '',
                        repoName: edsConfigRef.current?.repoName || '',
                        daLiveOrg: authData.orgName,
                        daLiveSite: edsConfigRef.current?.daLiveSite || '',
                        daLiveAuth: {
                            ...edsConfigRef.current?.daLiveAuth,
                            isAuthenticated: true,
                            isAuthenticating: false,
                            error: undefined,
                        },
                    },
                });
            } else if (!authData.isAuthenticated && authData.orgName) {
                // Not authenticated but have a default org — pre-fill it
                updateStateRef.current({
                    edsConfig: {
                        ...edsConfigRef.current,
                        accsHost: edsConfigRef.current?.accsHost || '',
                        storeViewCode: edsConfigRef.current?.storeViewCode || '',
                        customerGroup: edsConfigRef.current?.customerGroup || '',
                        repoName: edsConfigRef.current?.repoName || '',
                        daLiveOrg: authData.orgName,
                        daLiveSite: edsConfigRef.current?.daLiveSite || '',
                        daLiveAuth: {
                            ...edsConfigRef.current?.daLiveAuth,
                            isAuthenticated: false,
                            isAuthenticating: false,
                            error: authData.error,
                        },
                    },
                });
            } else {
                updateDaLiveAuthRef.current({
                    isAuthenticated: authData.isAuthenticated,
                    isAuthenticating: false,
                    error: authData.error,
                });
            }
        });

        // Listen for login opened (returns bookmarklet URL)
        const unsubscribeOpened = webviewClient.onMessage('dalive-login-opened', (data) => {
            const openedData = data as DaLiveLoginOpenedData;
            log.debug('DA.live login opened, bookmarklet URL received');

            setBookmarkletUrl(openedData.bookmarkletUrl);
            // Keep isAuthenticating true - user needs to paste token
        });

        // Listen for token stored
        const unsubscribeStored = webviewClient.onMessage('dalive-token-stored', (data) => {
            const storedData = data as DaLiveTokenStoredData;
            log.debug('DA.live token stored:', storedData);

            if (storedData.success) {
                updateDaLiveAuthRef.current({
                    isAuthenticated: true,
                    isAuthenticating: false,
                    error: undefined,
                });
            } else {
                updateDaLiveAuthRef.current({
                    isAuthenticated: false,
                    isAuthenticating: false,
                    error: storedData.error || 'Failed to store token',
                });
            }
        });

        // Listen for auth errors
        const unsubscribeError = webviewClient.onMessage('dalive-auth-error', (data) => {
            const errorData = data as { error: string };
            log.error('DA.live auth error:', errorData.error);

            updateDaLiveAuthRef.current({
                isAuthenticated: false,
                isAuthenticating: false,
                error: errorData.error,
            });
        });

        // Listen for combined token + org result
        const unsubscribeTokenWithOrg = webviewClient.onMessage('dalive-token-with-org-result', (data) => {
            const resultData = data as DaLiveTokenWithOrgResultData;
            log.debug('DA.live token with org result:', resultData);

            if (resultData.success && resultData.orgName) {
                // Store the verified org in edsConfig so DataSourceConfigStep can use it
                updateStateRef.current({
                    edsConfig: {
                        ...edsConfigRef.current,
                        accsHost: edsConfigRef.current?.accsHost || '',
                        storeViewCode: edsConfigRef.current?.storeViewCode || '',
                        customerGroup: edsConfigRef.current?.customerGroup || '',
                        repoName: edsConfigRef.current?.repoName || '',
                        daLiveOrg: resultData.orgName,
                        daLiveSite: edsConfigRef.current?.daLiveSite || '',
                        daLiveAuth: {
                            ...edsConfigRef.current?.daLiveAuth,
                            isAuthenticated: true,
                            isAuthenticating: false,
                            error: undefined,
                        },
                    },
                });
            } else {
                updateDaLiveAuthRef.current({
                    isAuthenticated: false,
                    isAuthenticating: false,
                    error: resultData.error || 'Failed to verify organization',
                });
            }
        });

        return () => {
            unsubscribeStatus();
            unsubscribeOpened();
            unsubscribeStored();
            unsubscribeError();
            unsubscribeTokenWithOrg();
        };
    }, []); // Empty deps - runs once on mount

    return {
        isAuthenticated: daLiveAuth?.isAuthenticated || false,
        isAuthenticating: daLiveAuth?.isAuthenticating || false,
        isChecking,
        error: daLiveAuth?.error,
        bookmarkletUrl,
        setupComplete: setupCompleteRef.current,
        verifiedOrg: edsConfig?.daLiveOrg,
        openDaLive,
        storeToken,
        storeTokenWithOrg,
        checkAuthStatus,
        resetAuth,
        cancelAuth,
    };
}
