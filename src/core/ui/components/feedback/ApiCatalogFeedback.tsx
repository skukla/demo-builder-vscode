/**
 * ApiCatalogFeedback — the loading / signed-out / failed views for an Adobe API
 * catalog fetch, in ONE place.
 *
 * Two surfaces pick Adobe APIs — the Add Integration flow's picker stage and the
 * dashboard's Manage APIs modal — over the same ~35–39s `getServicesForOrg` call.
 * They therefore need the same three non-picker views, and every one of them was
 * fixed on ONE surface first and copied to the other by hand (2026-07-31):
 * the centered loading treatment, the Retry on failure, and the sign-in action.
 * Three hand-copies in a day is the drift this module removes.
 *
 * Returns an ELEMENT OR NULL rather than rendering a container, because the two
 * callers legitimately wrap differently — the stage uses its full-bleed
 * `.intflow-api-center` band (which also carries its test id), the modal a
 * height-reserving `CenteredFeedbackContainer` that stops the dialog resizing.
 * Null means "nothing to say" — render the picker.
 *
 * The FETCH is deliberately not shared: each surface orchestrates its own (the
 * modal seeds selection state from the response and resets per open), and forcing
 * one hook over both would invent an abstraction neither wants.
 *
 * @module core/ui/components/feedback/ApiCatalogFeedback
 */

import Key from '@spectrum-icons/workflow/Key';
import Login from '@spectrum-icons/workflow/Login';
import React from 'react';
import { LoadingDisplay } from './LoadingDisplay';
import { StatusDisplay } from './StatusDisplay';

export interface ApiCatalogFeedbackState {
    /** The fetch is in flight. */
    loading: boolean;
    /** Staged sub-message from `useElapsedStage` (the wait is long enough to look frozen). */
    loadingStage?: string;
    /** The failure was "not signed in" — a sign-in action, never a Retry. */
    needsSignIn?: boolean;
    /** A retryable failure message. */
    error?: string | null;
    /**
     * Start a user-initiated Adobe sign-in; resolves when it finishes. Host-supplied
     * (the wizard sends `authenticate`, the dashboard `reAuthenticate`). Omitted →
     * the reason shows with no action, rather than a dead button.
     */
    onSignIn?: () => Promise<unknown>;
    /** Re-fire the fetch — the Retry action, and the follow-up after a sign-in. */
    onRetry?: () => void;
    /**
     * Completes "Sign in to …" — names what the user was trying to do, e.g.
     * "choose the APIs this app needs".
     */
    signInPurpose: string;
}

/**
 * The view for the current fetch state, or null when the picker should render.
 *
 * @param state - the fetch lifecycle plus the two host actions
 * @returns the loading / sign-in / error element, or null if there is none
 */
export function renderApiCatalogFeedback(
    state: ApiCatalogFeedbackState,
): React.ReactElement | null {
    const { loading, loadingStage, needsSignIn, error, onSignIn, onRetry, signInPurpose } = state;

    if (loading) {
        // A static label reads as FROZEN on a fetch this long (38.9s measured).
        // helperText sets the expectation up front; the staged subMessage shows it
        // is still moving.
        return (
            <LoadingDisplay
                size="L"
                message="Loading Adobe APIs…"
                subMessage={loadingStage}
                helperText="This can take up to a minute"
            />
        );
    }

    // Signed out is NOT retryable — a Retry re-runs the same unauthenticated call
    // and fails identically. The house treatment is AdobeAuthStep's: a StatusDisplay
    // whose action STARTS a sign-in (user-initiated, because it opens a browser).
    if (needsSignIn) {
        return (
            <StatusDisplay
                variant="info"
                height="100%"
                icon={<Key size="L" UNSAFE_className="text-gray-500" />}
                title="Sign in to Adobe"
                message={`Your Adobe session has ended. Sign in to ${signInPurpose}.`}
                actions={
                    onSignIn
                        ? [
                              {
                                  label: 'Sign In with Adobe',
                                  icon: <Login size="S" />,
                                  variant: 'accent' as const,
                                  onPress: () => void onSignIn().then(onRetry),
                              },
                          ]
                        : []
                }
            />
        );
    }

    if (error) {
        return (
            <StatusDisplay
                variant="error"
                height="100%"
                title="Couldn't load Adobe APIs"
                message={error}
                actions={
                    onRetry
                        ? [{ label: 'Retry', variant: 'accent' as const, onPress: onRetry }]
                        : []
                }
            />
        );
    }

    return null;
}
