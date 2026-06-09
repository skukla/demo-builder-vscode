/**
 * defaultSyncStrategyForProject — content forks reset to the master (content lives
 * in DA.live/AEM, not the repo, so reset is safe); commerce/legacy keep the existing
 * 'merge' default (merge-with-reset-fallback). Preserves commerce behavior.
 */

import { defaultSyncStrategyForProject } from '@/features/updates/services/syncStrategy';
import type { Project } from '@/types/base';

const project = (over: Partial<Project>): Project => ({
    name: 'demo',
    created: new Date(),
    lastModified: new Date(),
    path: '/x',
    status: 'created' as Project['status'],
    ...over,
});

describe('defaultSyncStrategyForProject', () => {
    it('content fork → reset-to-upstream', () => {
        expect(defaultSyncStrategyForProject(project({ flow: 'content' }))).toBe('reset');
    });

    it('commerce project → merge (unchanged)', () => {
        expect(defaultSyncStrategyForProject(project({ flow: 'commerce' }))).toBe('merge');
    });

    it('legacy project (no flow) → merge (unchanged)', () => {
        expect(defaultSyncStrategyForProject(project({}))).toBe('merge');
    });

    it('null/undefined → merge', () => {
        expect(defaultSyncStrategyForProject(undefined)).toBe('merge');
        expect(defaultSyncStrategyForProject(null)).toBe('merge');
    });
});
