/**
 * Tests for AdobeAuthStep predicate functions (SOP §10 compliance)
 *
 * These predicates extract long && chains from JSX conditionals
 * to improve readability and testability.
 */

import {
    isTokenExpiringSoon,
    isAuthenticatedWithOrg,
    needsOrgSelection,
    isNotAuthenticated,
    hasAuthError,
    hasAuthTimeout,
    AuthPredicateState,
} from '@/features/authentication/ui/steps/authPredicates';

describe('AdobeAuthStep predicates', () => {
    describe('isTokenExpiringSoon', () => {
        it('returns true when authenticated with expiring token', () => {
            const state: AuthPredicateState = {
                isChecking: false,
                isAuthenticated: true,
                tokenExpiringSoon: true,
            };
            expect(isTokenExpiringSoon(state)).toBe(true);
        });

        it('returns false when checking', () => {
            const state: AuthPredicateState = {
                isChecking: true,
                isAuthenticated: true,
                tokenExpiringSoon: true,
            };
            expect(isTokenExpiringSoon(state)).toBe(false);
        });

        it('returns false when not authenticated', () => {
            const state: AuthPredicateState = {
                isChecking: false,
                isAuthenticated: false,
                tokenExpiringSoon: true,
            };
            expect(isTokenExpiringSoon(state)).toBe(false);
        });

        it('returns false when token is not expiring', () => {
            const state: AuthPredicateState = {
                isChecking: false,
                isAuthenticated: true,
                tokenExpiringSoon: false,
            };
            expect(isTokenExpiringSoon(state)).toBe(false);
        });
    });

    describe('isAuthenticatedWithOrg', () => {
        it('returns true when authenticated with org and not expiring', () => {
            const state: AuthPredicateState = {
                isChecking: false,
                isAuthenticated: true,
                tokenExpiringSoon: false,
            };
            const adobeOrg = { id: '123', name: 'Test Org' };
            expect(isAuthenticatedWithOrg(state, adobeOrg)).toBe(true);
        });

        it('returns false when checking', () => {
            const state: AuthPredicateState = {
                isChecking: true,
                isAuthenticated: true,
                tokenExpiringSoon: false,
            };
            const adobeOrg = { id: '123', name: 'Test Org' };
            expect(isAuthenticatedWithOrg(state, adobeOrg)).toBe(false);
        });

        it('returns false when no org', () => {
            const state: AuthPredicateState = {
                isChecking: false,
                isAuthenticated: true,
                tokenExpiringSoon: false,
            };
            expect(isAuthenticatedWithOrg(state, undefined)).toBe(false);
        });

        it('returns false when token expiring', () => {
            const state: AuthPredicateState = {
                isChecking: false,
                isAuthenticated: true,
                tokenExpiringSoon: true,
            };
            const adobeOrg = { id: '123', name: 'Test Org' };
            expect(isAuthenticatedWithOrg(state, adobeOrg)).toBe(false);
        });

        it('returns false when not authenticated', () => {
            const state: AuthPredicateState = {
                isChecking: false,
                isAuthenticated: false,
                tokenExpiringSoon: false,
            };
            const adobeOrg = { id: '123', name: 'Test Org' };
            expect(isAuthenticatedWithOrg(state, adobeOrg)).toBe(false);
        });
    });

    describe('needsOrgSelection', () => {
        it('returns true when authenticated but no org', () => {
            const state: AuthPredicateState = {
                isChecking: false,
                isAuthenticated: true,
            };
            expect(needsOrgSelection(state, undefined)).toBe(true);
        });

        it('returns false when checking', () => {
            const state: AuthPredicateState = {
                isChecking: true,
                isAuthenticated: true,
            };
            expect(needsOrgSelection(state, undefined)).toBe(false);
        });

        it('returns false when has org', () => {
            const state: AuthPredicateState = {
                isChecking: false,
                isAuthenticated: true,
            };
            const adobeOrg = { id: '123', name: 'Test Org' };
            expect(needsOrgSelection(state, adobeOrg)).toBe(false);
        });

        it('returns false when not authenticated', () => {
            const state: AuthPredicateState = {
                isChecking: false,
                isAuthenticated: false,
            };
            expect(needsOrgSelection(state, undefined)).toBe(false);
        });
    });

    describe('isNotAuthenticated', () => {
        it('returns true when not authenticated and no error/timeout', () => {
            const state: AuthPredicateState = {
                isChecking: false,
                isAuthenticated: false,
                error: undefined,
            };
            expect(isNotAuthenticated(state, false)).toBe(true);
        });

        it('returns false when checking', () => {
            const state: AuthPredicateState = {
                isChecking: true,
                isAuthenticated: false,
                error: undefined,
            };
            expect(isNotAuthenticated(state, false)).toBe(false);
        });

        it('returns false when authenticated', () => {
            const state: AuthPredicateState = {
                isChecking: false,
                isAuthenticated: true,
                error: undefined,
            };
            expect(isNotAuthenticated(state, false)).toBe(false);
        });

        it('returns false when has error', () => {
            const state: AuthPredicateState = {
                isChecking: false,
                isAuthenticated: false,
                error: 'Some error',
            };
            expect(isNotAuthenticated(state, false)).toBe(false);
        });

        it('returns false when timed out', () => {
            const state: AuthPredicateState = {
                isChecking: false,
                isAuthenticated: false,
                error: undefined,
            };
            expect(isNotAuthenticated(state, true)).toBe(false);
        });
    });

    describe('hasAuthError', () => {
        it('returns true when has error and no timeout', () => {
            const state: AuthPredicateState = {
                isChecking: false,
                error: 'Authentication failed',
            };
            expect(hasAuthError(state, false)).toBe(true);
        });

        it('returns false when checking', () => {
            const state: AuthPredicateState = {
                isChecking: true,
                error: 'Authentication failed',
            };
            expect(hasAuthError(state, false)).toBe(false);
        });

        it('returns false when no error', () => {
            const state: AuthPredicateState = {
                isChecking: false,
                error: undefined,
            };
            expect(hasAuthError(state, false)).toBe(false);
        });

        it('returns false when timed out', () => {
            const state: AuthPredicateState = {
                isChecking: false,
                error: 'Authentication failed',
            };
            expect(hasAuthError(state, true)).toBe(false);
        });
    });

    describe('hasAuthTimeout', () => {
        it('returns true when timed out and not checking/authenticated', () => {
            const state: AuthPredicateState = {
                isChecking: false,
                isAuthenticated: false,
            };
            expect(hasAuthTimeout(state, true)).toBe(true);
        });

        it('returns false when not timed out', () => {
            const state: AuthPredicateState = {
                isChecking: false,
                isAuthenticated: false,
            };
            expect(hasAuthTimeout(state, false)).toBe(false);
        });

        it('returns false when checking', () => {
            const state: AuthPredicateState = {
                isChecking: true,
                isAuthenticated: false,
            };
            expect(hasAuthTimeout(state, true)).toBe(false);
        });

        it('returns false when authenticated', () => {
            const state: AuthPredicateState = {
                isChecking: false,
                isAuthenticated: true,
            };
            expect(hasAuthTimeout(state, true)).toBe(false);
        });
    });
});
