/**
 * Reading a public repository with no credential.
 *
 * The response shapes are GitHub's documented ones (`GET /repos/{owner}/{repo}`
 * and `GET /repos/{owner}/{repo}/contents/{path}`), with the fields this repo's
 * `GitHubRepo` and `GitHubFileContent` carry.
 */

import { PublicReadError, publicRepoReaders } from '@/features/eds/services/github/publicGitHubReads';

const REPO_JSON = {
    id: 1035782,
    name: 'aistore',
    full_name: 'sayurihanki/aistore',
    html_url: 'https://github.com/sayurihanki/aistore',
    clone_url: 'https://github.com/sayurihanki/aistore.git',
    default_branch: 'main',
    is_template: false,
    private: false,
};

function answering(byUrl: Record<string, { status: number; body?: unknown }>) {
    return jest.fn(async (url: string) => {
        const match = Object.keys(byUrl).find((key) => url.includes(key));
        const answer = match ? byUrl[match] : { status: 404 };
        return {
            ok: answer.status >= 200 && answer.status < 300,
            status: answer.status,
            json: async () => answer.body,
        } as unknown as Response;
    }) as unknown as jest.MockedFunction<typeof fetch>;
}

describe('publicRepoReaders — the repository', () => {
    it('reads it with no Authorization header at all', async () => {
        const fetchImpl = answering({ '/repos/sayurihanki/aistore': { status: 200, body: REPO_JSON } });

        const repo = await publicRepoReaders(fetchImpl).repoOps.getRepository('sayurihanki', 'aistore');

        expect(repo).toEqual({
            id: 1035782,
            name: 'aistore',
            fullName: 'sayurihanki/aistore',
            htmlUrl: 'https://github.com/sayurihanki/aistore',
            cloneUrl: 'https://github.com/sayurihanki/aistore.git',
            defaultBranch: 'main',
            isTemplate: false,
            isPrivate: false,
        });
        const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
        expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    });

    it("throws with GitHub's status, so the caller can tell a 404 from a rate limit", async () => {
        const fetchImpl = answering({ '/repos/jen/private-one': { status: 404 } });

        const read = publicRepoReaders(fetchImpl).repoOps.getRepository('jen', 'private-one');

        await expect(read).rejects.toBeInstanceOf(PublicReadError);
        await expect(read).rejects.toMatchObject({ status: 404 });
    });
});

describe('publicRepoReaders — files', () => {
    const contents = (body: unknown, status = 200) =>
        answering({ '/contents/fstab.yaml': { status, body } });

    it('decodes the base64 GitHub answers with', async () => {
        const fetchImpl = contents({
            type: 'file',
            encoding: 'base64',
            sha: 'abc',
            content: Buffer.from('mountpoints:\n  /: https://content.da.live/jen/isle5/\n').toString('base64'),
        });

        const file = await publicRepoReaders(fetchImpl).fileOps.getFileContent('jen', 'isle5', 'fstab.yaml');

        expect(file).toEqual({
            content: 'mountpoints:\n  /: https://content.da.live/jen/isle5/\n',
            sha: 'abc',
            path: 'fstab.yaml',
            encoding: 'base64',
        });
    });

    it('answers null for a file that is not there, as the signed-in reader does', async () => {
        const fetchImpl = contents(undefined, 404);

        const file = await publicRepoReaders(fetchImpl).fileOps.getFileContent('jen', 'isle5', 'fstab.yaml');

        expect(file).toBeNull();
    });

    it('answers null for a directory and for a file too large to inline', async () => {
        // A directory answers an ARRAY; a file over 1 MB answers with empty content.
        const directory = await publicRepoReaders(contents([{ name: 'a.js' }])).fileOps.getFileContent(
            'jen',
            'isle5',
            'fstab.yaml',
        );
        const huge = await publicRepoReaders(
            contents({ type: 'file', encoding: 'none', content: '', sha: 'x' }),
        ).fileOps.getFileContent('jen', 'isle5', 'fstab.yaml');

        expect(directory).toBeNull();
        expect(huge).toBeNull();
    });
});
