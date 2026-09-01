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

import { type MutableRefObject, useEffect, useCallback, useRef, useState } from 'react';
import { edsConfigStringDefaults } from '../helpers/edsConfigDefaults';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import type { WizardState, EDSConfig } from '@/types/webview';
import type { DaLiveAuthStatusPayload, DaLiveLoginOpenedPayload, DaLiveTokenStoredPayload, DaLiveTokenWithOrgResultPayload } from '@/types/webviewPayloads';

const log = webviewLogger('useDaLiveAuth');

// The wire shapes live in @/types/webviewPayloads — ONE declaration shared
// with edsDaLiveAuthHandlers (this file used to carry its own copies).

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
    /** Store token and verify org in one step (recommended) */
    storeTokenWithOrg: (token: string, orgName: string) => void;
    /** Check current auth status */
    checkAuthStatus: () => void;
    /** Reset DA.live auth (clear token and org) */
    resetAuth: () => void;
    /** Cancel current auth attempt (reset isAuthenticating without clearing token) */
    cancelAuth: () => void;
}

// ==========================================================
// Message Handler Helpers
// ==========================================================

type EdsConfigRef = MutableRefObject<EDSConfig | undefined>;
type UpdateStateRef = MutableRefObject<(updates: Partial<WizardState>) => void>;
type UpdateDaLiveAuthRef = MutableRefObject<(updates: Partial<NonNullable<EDSConfig['daLiveAuth']>>) => void>;

/** Build an edsConfig update object with org and auth state. */
function buildEdsConfigWithOrg(
    edsConfigRef: EdsConfigRef,
    orgName: string,
    authUpdates: Partial<NonNullable<EDSConfig['daLiveAuth']>>,
): Partial<WizardState> {
    return {
        edsConfig: {
            ...edsConfigRef.current,
            accsHost: edsConfigRef.current?.accsHost || '',
            storeViewCode: edsConfigRef.current?.storeViewCode || '',
            customerGroup: edsConfigRef.current?.customerGroup || '',
            repoName: edsConfigRef.current?.repoName || '',
            daLiveOrg: orgName,
            daLiveSite: edsConfigRef.current?.daLiveSite || '',
            daLiveAuth: {
                ...edsConfigRef.current?.daLiveAuth,
                isAuthenticated: edsConfigRef.current?.daLiveAuth?.isAuthenticated || false,
                ...authUpdates,
            },
        },
    };
}

/** Handle 'dalive-auth-status' message: update state based on auth and org presence. */
function handleAuthStatusUpdate(
    authData: DaLiveAuthStatusPayload,
    edsConfigRef: EdsConfigRef,
    updateStateRef: UpdateStateRef,
    updateDaLiveAuthRef: UpdateDaLiveAuthRef,
): void {
    if (authData.isAuthenticated && authData.orgName) {
        updateStateRef.current(buildEdsConfigWithOrg(edsConfigRef, authData.orgName, {
            isAuthenticated: true, isAuthenticating: false, error: undefined,
        }));
    } else if (!authData.isAuthenticated && authData.orgName) {
        updateStateRef.current(buildEdsConfigWithOrg(edsConfigRef, authData.orgName, {
            isAuthenticated: false, isAuthenticating: false, error: authData.error,
        }));
    } else {
        updateDaLiveAuthRef.current({
            isAuthenticated: authData.isAuthenticated,
            isAuthenticating: false,
            error: authData.error,
        });
    }
}

/** Handle 'dalive-token-stored' message. */
function handleTokenStored(
    storedData: DaLiveTokenStoredPayload,
    updateDaLiveAuthRef: UpdateDaLiveAuthRef,
): void {
    if (storedData.success) {
        updateDaLiveAuthRef.current({ isAuthenticated: true, isAuthenticating: false, error: undefined });
    } else {
        updateDaLiveAuthRef.current({
            isAuthenticated: false, isAuthenticating: false,
            error: storedData.error || 'Failed to store token',
        });
    }
}

/** Handle 'dalive-token-with-org-result' message. */
function handleTokenWithOrgResult(
    resultData: DaLiveTokenWithOrgResultPayload,
    edsConfigRef: EdsConfigRef,
    updateStateRef: UpdateStateRef,
    updateDaLiveAuthRef: UpdateDaLiveAuthRef,
): void {
    if (resultData.success && resultData.orgName) {
        updateStateRef.current(buildEdsConfigWithOrg(edsConfigRef, resultData.orgName, {
            isAuthenticated: true, isAuthenticating: false, error: undefined,
        }));
    } else {
        updateDaLiveAuthRef.current({
            isAuthenticated: false, isAuthenticating: false,
            error: resultData.error || 'Failed to verify organization',
        });
    }
}

// ==========================================================
// Hook
// ==========================================================

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
                ...edsConfigStringDefaults(edsConfig),
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
                ...edsConfigStringDefaults(edsConfig),
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
            const authData = data as DaLiveAuthStatusPayload;
            log.debug('Received DA.live auth status:', authData);
            setIsChecking(false);

            if (authData.setupComplete !== undefined) {
                setupCompleteRef.current = authData.setupComplete;
            }
            if (authData.bookmarkletUrl) {
                setBookmarkletUrl(authData.bookmarkletUrl);
            }

            handleAuthStatusUpdate(authData, edsConfigRef, updateStateRef, updateDaLiveAuthRef);
        });

        // Listen for login opened (returns bookmarklet URL)
        const unsubscribeOpened = webviewClient.onMessage('dalive-login-opened', (data) => {
            const openedData = data as DaLiveLoginOpenedPayload;
            log.debug('DA.live login opened, bookmarklet URL received');
            setBookmarkletUrl(openedData.bookmarkletUrl);
        });

        // Listen for token stored
        const unsubscribeStored = webviewClient.onMessage('dalive-token-stored', (data) => {
            const storedData = data as DaLiveTokenStoredPayload;
            log.debug('DA.live token stored:', storedData);
            handleTokenStored(storedData, updateDaLiveAuthRef);
        });

        // No `dalive-auth-error` listener any more: no code anywhere sends it
        // (failures ride `dalive-auth-status`/`dalive-token-stored` with an
        // `error` field), so it could never fire — found by the 2026-08-21
        // channel inventory.
        // Listen for combined token + org result
        const unsubscribeTokenWithOrg = webviewClient.onMessage('dalive-token-with-org-result', (data) => {
            const resultData = data as DaLiveTokenWithOrgResultPayload;
            log.debug('DA.live token with org result:', resultData);
            handleTokenWithOrgResult(resultData, edsConfigRef, updateStateRef, updateDaLiveAuthRef);
        });

        return () => {
            unsubscribeStatus();
            unsubscribeOpened();
            unsubscribeStored();
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
        storeTokenWithOrg,
        checkAuthStatus,
        resetAuth,
        cancelAuth,
    };
}
