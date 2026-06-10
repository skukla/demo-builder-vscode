/**
 * Tests for getProjectArchetype — the per-(product, ownership) predicate that
 * lets the dashboard recognize a content-SC fork without a 20-file isEds rewrite.
 *
 * Composes the Step-1 flow predicate (ownership) with the existing EDS/stack
 * signal (product). Absent flow ⇒ commerce ownership (legacy unchanged).
 */

import { getProjectArchetype } from '@/types/typeGuards';
import type { Project } from '@/types/base';

const project = (over: Partial<Project>): Project => ({
    name: 'demo',
    created: new Date(),
    lastModified: new Date(),
    path: '/x',
    status: 'created' as Project['status'],
    ...over,
});

describe('getProjectArchetype', () => {
    it('content EDS fork → { eds-storefront, content }', () => {
        expect(getProjectArchetype(project({ selectedStack: 'eds-paas', flow: 'content' }))).toEqual({
            product: 'eds-storefront',
            ownership: 'content',
        });
    });

    it('commerce EDS project → { eds-storefront, commerce }', () => {
        expect(getProjectArchetype(project({ selectedStack: 'eds-accs', flow: 'commerce' }))).toEqual({
            product: 'eds-storefront',
            ownership: 'commerce',
        });
    });

    it('headless project → { headless-storefront, commerce }', () => {
        expect(getProjectArchetype(project({ selectedStack: 'headless-paas' }))).toEqual({
            product: 'headless-storefront',
            ownership: 'commerce',
        });
    });

    it('legacy / unknown stack → { other, commerce }', () => {
        expect(getProjectArchetype(project({}))).toEqual({ product: 'other', ownership: 'commerce' });
    });

    it('null/undefined project → { other, commerce }', () => {
        expect(getProjectArchetype(undefined)).toEqual({ product: 'other', ownership: 'commerce' });
        expect(getProjectArchetype(null)).toEqual({ product: 'other', ownership: 'commerce' });
    });
});
