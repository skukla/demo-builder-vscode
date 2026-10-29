/**
 * boilerplateGitHub — the REST reads behind the boilerplate base lookup (EDS-56), driven
 * through a fetch fake. Response shapes are GitHub's, as read live on 2026-10-20 for
 * kmanns/justrite and adobe-commerce/boilerplate-b2b-template (trimmed to the fields read).
 */

import { createBoilerplateGitHub } from '@/features/updates/services/boilerplateGitHub';
import { createMockSecretStorage, githubTokenSecret } from '../../../helpers/secretStorageFake';

global.fetch = jest.fn();
const fetchMock = global.fetch as jest.Mock;
const JUSTRITE = { owner: 'kmanns', repo: 'justrite' };
const B2B = { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' };

function respond(body: unknown, status = 200): void {
    fetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body });
}

const commit = (sha: string, tree: string, parents = 1) => ({
    sha,
    parents: Array.from({ length: parents }, () => ({ sha: 'p' })),
    commit: { tree: { sha: tree } },
});

function reads() {
    return createBoilerplateGitHub(createMockSecretStorage(githubTokenSecret('test-github-token')).secrets);
}

beforeEach(() => fetchMock.mockReset());

describe('createBoilerplateGitHub', () => {
    it("reads when a repository was made and which template GitHub says it came from", async () => {
        respond({
            created_at: '2026-09-23T16:38:05Z',
            template_repository: { name: 'boilerplate-b2b-template', owner: { login: 'adobe-commerce' } },
        });

        await expect(reads().repository(JUSTRITE)).resolves.toEqual({
            createdAt: '2026-09-23T16:38:05Z',
            templateRepository: B2B,
        });
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.github.com/repos/kmanns/justrite',
            expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'token test-github-token' }) }),
        );
    });

    it('reads a repository GitHub made from no template', async () => {
        respond({ created_at: '2026-09-23T16:38:05Z', template_repository: null });

        await expect(reads().repository(JUSTRITE)).resolves.toEqual({ createdAt: '2026-09-23T16:38:05Z' });
    });

    it("finds the first commit's tree on the last page of the history", async () => {
        respond(Array.from({ length: 100 }, (_, i) => commit(`c${i}`, `t${i}`)));
        respond([commit('later', 'tl'), commit('root', 'root-tree', 0)]);

        await expect(reads().firstCommitTree(JUSTRITE)).resolves.toBe('root-tree');
        expect(fetchMock).toHaveBeenLastCalledWith(
            'https://api.github.com/repos/kmanns/justrite/commits?per_page=100&page=2',
            expect.anything(),
        );
    });

    it("lists the template's commits from before a date, with their trees", async () => {
        respond([commit('a1', 'ta'), commit('b2', 'tb')]);

        await expect(reads().commitsBefore(B2B, '2026-09-23T16:38:05Z')).resolves.toEqual([
            { sha: 'a1', tree: 'ta' },
            { sha: 'b2', tree: 'tb' },
        ]);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.github.com/repos/adobe-commerce/boilerplate-b2b-template/commits?per_page=100&until=2026-09-23T16%3A38%3A05Z',
            expect.anything(),
        );
    });

    it("reads a tree's top level, name to object", async () => {
        respond({ tree: [{ path: 'blocks', sha: 'b1', type: 'tree' }, { path: 'package.json', sha: 'p1', type: 'blob' }] });

        await expect(reads().topLevel(B2B, 'tree-sha')).resolves.toEqual({ blocks: 'b1', 'package.json': 'p1' });
    });

    it.each([
        ['an error status', () => respond({}, 404)],
        ['a network failure', () => fetchMock.mockRejectedValueOnce(new Error('offline'))],
    ])('answers undefined on %s', async (_label, fail) => {
        fail();

        await expect(reads().repository(JUSTRITE)).resolves.toBeUndefined();
    });
});
