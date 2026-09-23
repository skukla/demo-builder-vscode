/**
 * The description file in the SC's repository follows the ADR-013 rule over
 * GitHub: ours to rewrite or remove only on proof (the blob sha we recorded);
 * anything else is left alone and reported.
 */

import { removeSharedDemoFile, writeSharedDemoFile } from '@/features/eds/services/demoPackage/sharedDemoFile';
import type { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';

const TARGET = { owner: 'steve', repo: 'shop' };
const CONTENT = '{"kind":"demo"}\n';

function fileOps(current: { content: string; sha: string } | null) {
    return {
        getFileContent: jest.fn().mockResolvedValue(current ? { ...current, path: 'demo.demo-builder.json', encoding: 'utf-8' } : null),
        createOrUpdateFile: jest.fn().mockResolvedValue({ sha: 'new-sha', commitSha: 'c1' }),
        deleteFile: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<Pick<GitHubFileOperations, 'getFileContent' | 'createOrUpdateFile' | 'deleteFile'>>;
}

describe('writeSharedDemoFile', () => {
    it('creates the file when there is none, and answers the sha to record', async () => {
        const ops = fileOps(null);
        const result = await writeSharedDemoFile(ops, TARGET, CONTENT, undefined);
        expect(result).toEqual({ outcome: 'written', sha: 'new-sha' });
        expect(ops.createOrUpdateFile).toHaveBeenCalledWith('steve', 'shop', 'demo.demo-builder.json', CONTENT, 'Save as demo package: add the description file', undefined);
    });

    it('rewrites a file we wrote, passing its sha, and leaves an identical one alone', async () => {
        const ours = fileOps({ content: '{"kind":"demo","name":"old"}\n', sha: 'ours' });
        expect(await writeSharedDemoFile(ours, TARGET, CONTENT, 'ours')).toEqual({ outcome: 'written', sha: 'new-sha' });
        expect(ours.createOrUpdateFile).toHaveBeenCalledWith('steve', 'shop', 'demo.demo-builder.json', CONTENT, 'Update the demo package description', 'ours');

        const same = fileOps({ content: CONTENT, sha: 'ours' });
        expect(await writeSharedDemoFile(same, TARGET, CONTENT, 'ours')).toEqual({ outcome: 'unchanged', sha: 'ours' });
        expect(same.createOrUpdateFile).not.toHaveBeenCalled();
    });

    it('never clobbers a file that is not ours: absent record, or a sha that moved', async () => {
        const theirs = fileOps({ content: '{"kind":"demo","name":"hand-written"}\n', sha: 'theirs' });
        const noRecord = await writeSharedDemoFile(theirs, TARGET, CONTENT, undefined);
        expect(noRecord.outcome).toBe('skipped');
        expect((noRecord as { reason: string }).reason).toMatch(/was not written by Demo Builder, or was edited since. Edit it yourself/);

        const edited = await writeSharedDemoFile(theirs, TARGET, CONTENT, 'ours');
        expect(edited.outcome).toBe('skipped');
        expect(theirs.createOrUpdateFile).not.toHaveBeenCalled();
    });
});

describe('removeSharedDemoFile', () => {
    it('removes only the file we wrote, and says when there is none or it is not ours', async () => {
        const ours = fileOps({ content: CONTENT, sha: 'ours' });
        expect(await removeSharedDemoFile(ours, TARGET, 'ours')).toBe('removed');
        expect(ours.deleteFile).toHaveBeenCalledWith('steve', 'shop', 'demo.demo-builder.json', 'Remove demo package', 'ours');

        const theirs = fileOps({ content: CONTENT, sha: 'theirs' });
        expect(await removeSharedDemoFile(theirs, TARGET, 'ours')).toBe('skipped');
        expect(await removeSharedDemoFile(theirs, TARGET, undefined)).toBe('skipped');
        expect(theirs.deleteFile).not.toHaveBeenCalled();

        expect(await removeSharedDemoFile(fileOps(null), TARGET, 'ours')).toBe('absent');
    });
});
