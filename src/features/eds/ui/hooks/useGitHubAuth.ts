/**
 * useGitHubAuth Hook
 *
 * Manages GitHub OAuth authentication state for EDS wizard steps.
 * Handles auth status checking, OAuth flow initiation, and state updates.
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import type { WizardState, EDSConfig } from '@/types/webview';

const log = webviewLogger('useGitHubAuth');

/**
 * GitHub auth status message data
 */
interface GitHubAuthStatusData {
    isAuthenticated: boolean;
    user?: {
        login: string;
        avatarUrl?: string;
        email?: string;
    };
    error?: string;
}

/**
 * GitHub OAuth error message data
 */
interface GitHubOAuthErrorData {
    error: string;
}

/**
 * Props for useGitHubAuth hook
 */
interface UseGitHubAuthProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
}

/**
 * Return type for useGitHubAuth hook
 */
interface UseGitHubAuthReturn {
    /** Whether user is authenticated with GitHub */
    isAuthenticated: boolean;
    /** Whether OAuth flow is in progress */
    isAuthenticating: boolean;
    /** Whether initial auth check is in progress */
    isChecking: boolean;
    /** Authenticated user info */
    user?: { login: string; avatarUrl?: string; email?: string };
    /** Error message if auth failed */
    error?: string;
    /** Start OAuth flow */
    startOAuth: () => void;
    /** Check current auth status */
    checkAuthStatus: () => void;
    /** Change GitHub account (clear and re-auth) */
    changeAccount: () => void;
}

/**
 * Hook for managing GitHub OAuth authentication state
 */
export function useGitHubAuth({
    state,
    updateState,
}: UseGitHubAuthProps): UseGitHubAuthReturn {
    // Track whether initial auth check is in progress
    const [isChecking, setIsChecking] = useState(true);

    const edsConfig = state.edsConfig;
    const githubAuth = edsConfig?.githubAuth;

    /**
     * Update EDS config with new GitHub auth state
     */
    const updateGitHubAuth = useCallback((updates: Partial<NonNullable<EDSConfig['githubAuth']>>) => {
        updateState({
            edsConfig: {
                ...edsConfig,
                accsHost: edsConfig?.accsHost || '',
                storeViewCode: edsConfig?.storeViewCode || '',
                customerGroup: edsConfig?.customerGroup || '',
                repoName: edsConfig?.repoName || '',
                daLiveOrg: edsConfig?.daLiveOrg || '',
                daLiveSite: edsConfig?.daLiveSite || '',
                githubAuth: {
                    ...githubAuth,
                    isAuthenticated: githubAuth?.isAuthenticated || false,
                    ...updates,
                },
            },
        });
    }, [edsConfig, githubAuth, updateState]);

    // Use ref to access latest updateGitHubAuth without triggering effect re-runs
    const updateGitHubAuthRef = useRef(updateGitHubAuth);
    updateGitHubAuthRef.current = updateGitHubAuth;

    /**
     * Check current GitHub auth status
     */
    const checkAuthStatus = useCallback(() => {
        log.debug('Checking GitHub auth status');
        webviewClient.postMessage('check-github-auth');
    }, []);

    /**
     * Start GitHub OAuth flow
     */
    const startOAuth = useCallback(() => {
        log.debug('Starting GitHub OAuth flow');
        updateGitHubAuthRef.current({ isAuthenticating: true, error: undefined });
        webviewClient.postMessage('github-oauth');
    }, []);

    /**
     * Change GitHub account - clears stored token and triggers new OAuth
     */
    const changeAccount = useCallback(() => {
        log.debug('Changing GitHub account');
        updateGitHubAuthRef.current({
            isAuthenticated: false,
            isAuthenticating: true,
            user: undefined,
            error: undefined,
        });
        webviewClient.postMessage('github-change-account');
    }, []);

    // Check auth status on mount and subscribe to messages (runs once)
    useEffect(() => {
        // Check status once on mount
        webviewClient.postMessage('check-github-auth');

        // Listen for auth status updates
        const unsubscribeStatus = webviewClient.onMessage('github-auth-status', (data) => {
            const authData = data as GitHubAuthStatusData;
            log.debug('Received GitHub auth status:', authData);

            // Initial check complete
            setIsChecking(false);

            updateGitHubAuthRef.current({
                isAuthenticated: authData.isAuthenticated,
                isAuthenticating: false,
                user: authData.user,
                error: authData.error,
            });
        });

        // Listen for OAuth completion
        const unsubscribeComplete = webviewClient.onMessage('github-auth-complete', (data) => {
            const authData = data as GitHubAuthStatusData;
            log.debug('GitHub OAuth complete:', authData);

            // Auth complete
            setIsChecking(false);

            updateGitHubAuthRef.current({
                isAuthenticated: authData.isAuthenticated,
                isAuthenticating: false,
                user: authData.user,
                error: undefined,
            });
        });

        // Listen for OAuth errors
        const unsubscribeError = webviewClient.onMessage('github-oauth-error', (data) => {
            const errorData = data as GitHubOAuthErrorData;
            log.error('GitHub OAuth error:', errorData.error);

            // Auth check complete (with error)
            setIsChecking(false);

            updateGitHubAuthRef.current({
                isAuthenticated: false,
                isAuthenticating: false,
                error: errorData.error,
            });
        });

        return () => {
            unsubscribeStatus();
            unsubscribeComplete();
            unsubscribeError();
        };
    }, []); // Empty deps - runs once on mount

    return {
        isAuthenticated: githubAuth?.isAuthenticated || false,
        isAuthenticating: githubAuth?.isAuthenticating || false,
        isChecking,
        user: githubAuth?.user,
        error: githubAuth?.error,
        startOAuth,
        checkAuthStatus,
        changeAccount,
    };
}
