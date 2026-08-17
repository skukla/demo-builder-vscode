/**
 * The `needsUser` handoff — what a tool returns when finishing needs a person.
 *
 * The contract these tests pin is that a handoff is DISTINGUISHABLE from an
 * outcome. `handleAddAppBuilderComponent` opens a panel and returns
 * `{success: true}`; nothing downstream can tell that apart from work done.
 */

import { isHandoff, needsUser, type NeedsUser } from '@/features/ai/server/handoff';

const SIGN_IN: NeedsUser = {
    reason: 'browser-oauth',
    what: 'Sign in to Adobe',
    where: { command: 'demoBuilder.signIn' },
    tellUser: 'Click Sign In in the Demo Builder panel and finish the Adobe login in your browser.',
    resumeWith: 'get_auth_status',
};

describe('needsUser', () => {
    it('nests under a key an agent can branch on', () => {
        expect(needsUser(SIGN_IN)).toEqual({ needsUser: SIGN_IN });
    });

    it('names a resume tool, so the agent need not guess how to continue', () => {
        expect(needsUser(SIGN_IN).needsUser.resumeWith).toBe('get_auth_status');
    });

    it('survives the JSON round-trip a handoff always makes', () => {
        expect(JSON.parse(JSON.stringify(needsUser(SIGN_IN)))).toEqual({ needsUser: SIGN_IN });
    });
});

describe('isHandoff', () => {
    it('accepts a handoff', () => {
        expect(isHandoff(needsUser(SIGN_IN))).toBe(true);
    });

    // The whole point: a real outcome must NOT read as a handoff, and the
    // bare-success shape a panel-opening handler returns must not read as one
    // either — it is the defect, not the fix.
    it.each([
        ['a real outcome', { success: true, projectId: 'p1' }],
        ['bare success', { success: true }],
        ['an error', { success: false, error: 'nope' }],
        ['null', null],
        ['a string', 'needsUser'],
        ['undefined', undefined],
    ])('rejects %s', (_label, value) => {
        expect(isHandoff(value)).toBe(false);
    });
});
