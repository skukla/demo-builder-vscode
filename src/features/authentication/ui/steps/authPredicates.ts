/**
 * Auth Step Predicate Functions (SOP §10 compliance)
 *
 * Extract long && chains from JSX conditionals to named predicates
 * for improved readability and testability.
 */

/**
 * State shape for auth predicates
 */
export interface AuthPredicateState {
    isChecking: boolean;
    isAuthenticated?: boolean;
    tokenExpiringSoon?: boolean;
    error?: string;
}

/**
 * Adobe Organization shape
 */
export interface AdobeOrg {
    id: string;
    name: string;
}

/**
 * Check if token is expiring soon
 *
 * Condition: !isChecking && isAuthenticated && tokenExpiringSoon
 */
export function isTokenExpiringSoon(state: AuthPredicateState): boolean {
    return (
        !state.isChecking &&
        state.isAuthenticated === true &&
        state.tokenExpiringSoon === true
    );
}

/**
 * Check if authenticated with valid organization (4 conditions - SOP §10 violation)
 *
 * Condition: !isChecking && isAuthenticated && adobeOrg && !tokenExpiringSoon
 */
export function isAuthenticatedWithOrg(
    state: AuthPredicateState,
    adobeOrg: AdobeOrg | undefined,
): boolean {
    return (
        !state.isChecking &&
        state.isAuthenticated === true &&
        adobeOrg !== undefined &&
        !state.tokenExpiringSoon
    );
}

/**
 * Check if organization selection is required
 *
 * Condition: !isChecking && isAuthenticated && !adobeOrg
 */
export function needsOrgSelection(
    state: AuthPredicateState,
    adobeOrg: AdobeOrg | undefined,
): boolean {
    return (
        !state.isChecking &&
        state.isAuthenticated === true &&
        adobeOrg === undefined
    );
}

/**
 * Check if user is not authenticated (4 conditions - SOP §10 violation)
 *
 * Condition: !isChecking && !authTimeout && isAuthenticated === false && !error
 */
export function isNotAuthenticated(
    state: AuthPredicateState,
    authTimeout: boolean,
): boolean {
    return (
        !state.isChecking &&
        !authTimeout &&
        state.isAuthenticated === false &&
        !state.error
    );
}

/**
 * Check if there's an authentication error
 *
 * Condition: !isChecking && error && !authTimeout
 */
export function hasAuthError(
    state: AuthPredicateState,
    authTimeout: boolean,
): boolean {
    return (
        !state.isChecking &&
        state.error !== undefined &&
        !authTimeout
    );
}

/**
 * Check if authentication timed out
 *
 * Condition: authTimeout && !isChecking && !isAuthenticated
 */
export function hasAuthTimeout(
    state: AuthPredicateState,
    authTimeout: boolean,
): boolean {
    return (
        authTimeout &&
        !state.isChecking &&
        !state.isAuthenticated
    );
}
