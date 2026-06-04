/**
 * Tests for the storefront `flow` predicates.
 *
 * These resolve a project/config's archetype flow ('commerce' | 'content'),
 * defaulting legacy records (no `flow`) to 'commerce' so existing behavior is
 * unchanged. They accept any flow-bearing shape (saved `Project` or the in-flight
 * `ProjectCreationConfig`), so they are structurally typed.
 */

import {
    getProjectFlow,
    isContentFlow,
    isCommerceFlow,
} from '@/types/typeGuards';

describe('flow predicates', () => {
    describe('getProjectFlow', () => {
        it('defaults to "commerce" when flow is absent (legacy record)', () => {
            expect(getProjectFlow({})).toBe('commerce');
        });

        it('returns "commerce" for an explicit commerce flow', () => {
            expect(getProjectFlow({ flow: 'commerce' })).toBe('commerce');
        });

        it('returns "content" for a content flow', () => {
            expect(getProjectFlow({ flow: 'content' })).toBe('content');
        });
    });

    describe('isContentFlow', () => {
        it('is true only for content', () => {
            expect(isContentFlow({ flow: 'content' })).toBe(true);
        });

        it('is false for commerce', () => {
            expect(isContentFlow({ flow: 'commerce' })).toBe(false);
        });

        it('is false for a legacy record (no flow)', () => {
            expect(isContentFlow({})).toBe(false);
        });
    });

    describe('isCommerceFlow', () => {
        it('is true for commerce', () => {
            expect(isCommerceFlow({ flow: 'commerce' })).toBe(true);
        });

        it('is true for a legacy record (no flow) — backward compatible', () => {
            expect(isCommerceFlow({})).toBe(true);
        });

        it('is false for content', () => {
            expect(isCommerceFlow({ flow: 'content' })).toBe(false);
        });
    });

    it('accepts a richer flow-bearing object (Project/Config shape) structurally', () => {
        const projectLike = { name: 'demo', flow: 'content' as const, upstream: { owner: 'o', repo: 'r' } };
        expect(getProjectFlow(projectLike)).toBe('content');
        expect(isContentFlow(projectLike)).toBe(true);
        expect(isCommerceFlow(projectLike)).toBe(false);
    });
});
