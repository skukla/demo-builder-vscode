/**
 * Type Guards Tests - getEdsGithubRepo
 *
 * The chain `componentInstances['eds-storefront'].metadata.githubRepo` was
 * already written out twice (getEdsLiveUrl, getEdsPreviewUrl) before the
 * credential probe needed it a third time. Rule of Three: extract it once, and
 * pin the behaviour both existing callers already depend on — notably that a
 * non-EDS project resolves to undefined rather than leaking another stack's
 * metadata.
 */

import { getEdsGithubRepo } from '@/types/typeGuards';
import { Project } from '@/types/base';

function projectWith(metadata: Record<string, unknown>, stack = 'eds-dalive'): Project {
    return {
        selectedStack: stack,
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'Edge Delivery Services',
                status: 'deployed',
                metadata,
            },
        },
    } as unknown as Project;
}

describe('getEdsGithubRepo', () => {
    it('returns the stored owner/repo', () => {
        expect(getEdsGithubRepo(projectWith({ githubRepo: 'acme-demos/aircraft-demo' }))).toBe(
            'acme-demos/aircraft-demo'
        );
    });

    it('returns undefined when the project is not an EDS project', () => {
        const paas = projectWith({ githubRepo: 'someone/other' }, 'commerce-paas');
        expect(getEdsGithubRepo(paas)).toBeUndefined();
    });

    it('returns undefined when no repo has been recorded yet', () => {
        expect(getEdsGithubRepo(projectWith({ daLiveOrg: 'acme-demos' }))).toBeUndefined();
    });

    it('returns undefined for a missing storefront component instance', () => {
        const bare = { selectedStack: 'eds-dalive', componentInstances: {} } as unknown as Project;
        expect(getEdsGithubRepo(bare)).toBeUndefined();
    });

    it('tolerates undefined and null projects', () => {
        expect(getEdsGithubRepo(undefined)).toBeUndefined();
        expect(getEdsGithubRepo(null)).toBeUndefined();
    });

    it('rejects a malformed value that is not owner/repo', () => {
        // Callers split on '/' — a bare name would yield an undefined half and
        // produce URLs like `https://main--undefined--name.aem.live`.
        expect(getEdsGithubRepo(projectWith({ githubRepo: 'no-slash-here' }))).toBeUndefined();
    });
});
