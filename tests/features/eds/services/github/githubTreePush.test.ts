/**
 * One commit from a set of files: text inline, binaries as blobs, batches in
 * order, the branch moved. The GitHub client is a fake; what is asserted is
 * the ARGUMENTS each call receives.
 */

import { pushFiles, type TreePushOps } from '@/features/eds/services/github/githubTreePush';
import { createMockLogger } from '../../../../helpers/loggerFake';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]);

function ops(): jest.Mocked<TreePushOps> {
    let trees = 0;
    return {
        getBranchInfo: jest.fn().mockResolvedValue({ commitSha: 'head-1', treeSha: 'tree-0' }),
        createBlob: jest.fn().mockResolvedValue('blob-png'),
        createTree: jest.fn().mockImplementation(async () => `tree-${++trees}`),
        createCommit: jest.fn().mockResolvedValue('commit-9'),
        updateBranchRef: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TreePushOps>;
}

describe('pushFiles', () => {
    const logger = createMockLogger();

    it('sends text inline, binaries as blobs, and moves main to the new commit', async () => {
        const o = ops();
        const files = new Map<string, Buffer>([
            ['head.html', Buffer.from('<meta>')],
            ['fonts/a.woff2', PNG],
        ]);

        const result = await pushFiles(o, 'steve', 'summit', files, 'Add storefront from a zip file', logger);

        expect(o.createBlob).toHaveBeenCalledWith('steve', 'summit', PNG.toString('base64'));
        expect(o.createTree).toHaveBeenCalledWith(
            'steve',
            'summit',
            [
                { path: 'head.html', mode: '100644', type: 'blob', content: '<meta>' },
                { path: 'fonts/a.woff2', mode: '100644', type: 'blob', sha: 'blob-png' },
            ],
            undefined,
        );
        expect(o.createCommit).toHaveBeenCalledWith('steve', 'summit', 'Add storefront from a zip file', 'tree-1', 'head-1');
        expect(o.updateBranchRef).toHaveBeenCalledWith('steve', 'summit', 'main', 'commit-9', true);
        expect(result).toEqual({ commitSha: 'commit-9', fileCount: 2 });
    });

    it('reports each binary upload and each batch of files as it goes', async () => {
        const o = ops();
        const files = new Map<string, Buffer>([
            ['head.html', Buffer.from('<meta>')],
            ['fonts/a.woff2', PNG],
        ]);
        const progress = jest.fn();

        await pushFiles(o, 'steve', 'summit', files, 'm', logger, progress);

        expect(progress.mock.calls).toStrictEqual([
            [{ kind: 'binary', done: 1, total: 1 }],
            [{ kind: 'files', done: 2, total: 2 }],
        ]);
    });

    it('refuses an empty set before touching the repository', async () => {
        const o = ops();
        await expect(pushFiles(o, 'steve', 'summit', new Map(), 'm', logger)).rejects.toThrow(/Nothing to push/);
        expect(o.createTree).not.toHaveBeenCalled();
    });
});
