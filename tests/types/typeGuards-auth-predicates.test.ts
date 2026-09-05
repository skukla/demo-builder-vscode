/**
 * Type Guards Tests - Authentication Predicates
 *
 * `canProceedFromAuth` is the Continue gate on the Adobe sign-in step: three
 * independent conditions, each of which alone blocks the step. Each is pinned
 * separately here, because a test that only checks "all good" and "all bad"
 * cannot tell whether the three are still being read at all.
 */

import { canProceedFromAuth, hasOrganizationName } from '@/types/typeGuards';

describe('hasOrganizationName', () => {
    it('is true when the organization carries a name', () => {
        expect(hasOrganizationName({ name: 'Acme Demo Org' })).toBe(true);
    });

    it('is false for an organization with an empty name', () => {
        expect(hasOrganizationName({ name: '' })).toBe(false);
    });

    it('is false for an organization object with no name at all', () => {
        expect(hasOrganizationName({})).toBe(false);
    });

    it.each([
        ['undefined', undefined],
        ['null', null],
    ])('is false for %s rather than throwing', (_label, org) => {
        expect(hasOrganizationName(org)).toBe(false);
    });
});

describe('canProceedFromAuth', () => {
    const ORG = { name: 'Acme Demo Org' };

    it('lets the user through when signed in, org resolved, token fresh', () => {
        expect(canProceedFromAuth(true, ORG, false)).toBe(true);
    });

    it('lets the user through when the token expiry is simply unknown', () => {
        expect(canProceedFromAuth(true, ORG, undefined)).toBe(true);
    });

    it('blocks when the user is not authenticated', () => {
        expect(canProceedFromAuth(false, ORG, false)).toBe(false);
    });

    it('blocks when no organization name has resolved yet', () => {
        expect(canProceedFromAuth(true, {}, false)).toBe(false);
    });

    it('blocks when the token is expiring soon', () => {
        expect(canProceedFromAuth(true, ORG, true)).toBe(false);
    });
});
