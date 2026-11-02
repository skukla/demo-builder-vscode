/**
 * resolveTemplateCommitSha — which source commit a storefront repository is built from.
 *
 * One answer for project creation and for reset, because both write it into the
 * storefront's `lastSyncedCommit` and "Check for Updates" compares against it. If the
 * two paths answered differently, a freshly reset storefront would disagree with a
 * freshly created one about what it already has.
 *
 * Every assertion reads what the resolver hands its collaborators or what it returns.
 */

jest.mock('@/features/eds/services/patches/lkgReader', () => ({
    readLkgSha: jest.fn(),
}));

import * as vscode from 'vscode';
import type { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import { readLkgSha } from '@/features/eds/services/patches/lkgReader';
import { resolveTemplateCommitSha } from '@/features/eds/services/templateCommitResolver';
import type { CodePatchSource } from '@/types/demoPackages';
import { createMockLogger } from '../../../helpers/loggerFake';

const mockReadLkgSha = readLkgSha as jest.MockedFunction<typeof readLkgSha>;

const PATCH_SOURCE: CodePatchSource = {
    owner: 'adobe',
    repo: 'eds-demo-patches',
    path: 'families/isle5',
    lkgFile: 'families/isle5/last-known-good',
};
const LKG_SHA = 'abcdef0123456789abcdef0123456789abcdef01';
const HEAD_SHA = '0123456789abcdef0123456789abcdef01234567';

function githubWithHead(head: () => Promise<string | null>): {
    github: Pick<GitHubFileOperations, 'getLatestCommitSha' | 'getRefCommit'>;
    getLatestCommitSha: jest.Mock;
} {
    const getLatestCommitSha = jest.fn(head);
    return { github: { getLatestCommitSha, getRefCommit: jest.fn() }, getLatestCommitSha };
}

beforeEach(() => {
    jest.resetAllMocks();
});

describe('resolveTemplateCommitSha', () => {
    it('answers the LKG for a thin-layer storefront and never asks the template for its head', async () => {
        mockReadLkgSha.mockResolvedValue(LKG_SHA);
        const { github, getLatestCommitSha } = githubWithHead(async () => HEAD_SHA);
        const logger = createMockLogger();

        const sha = await resolveTemplateCommitSha(
            { templateOwner: 'tpl-owner', templateRepo: 'tpl-repo', codePatchSource: PATCH_SOURCE },
            github,
            logger,
        );

        expect(sha).toBe(LKG_SHA);
        expect(mockReadLkgSha).toHaveBeenCalledWith(
            { owner: 'adobe', repo: 'eds-demo-patches', lkgFile: PATCH_SOURCE.lkgFile },
            logger,
        );
        expect(getLatestCommitSha).not.toHaveBeenCalled();
    });

    it('falls back to the template main head when the LKG is unreachable', async () => {
        mockReadLkgSha.mockResolvedValue(undefined);
        const { github, getLatestCommitSha } = githubWithHead(async () => HEAD_SHA);

        const sha = await resolveTemplateCommitSha(
            { templateOwner: 'tpl-owner', templateRepo: 'tpl-repo', codePatchSource: PATCH_SOURCE },
            github,
            createMockLogger(),
        );

        expect(sha).toBe(HEAD_SHA);
        expect(getLatestCommitSha).toHaveBeenCalledWith('tpl-owner', 'tpl-repo', 'main');
    });

    it('answers the template main head for a storefront without a code patch source', async () => {
        const { github, getLatestCommitSha } = githubWithHead(async () => HEAD_SHA);

        const sha = await resolveTemplateCommitSha(
            { templateOwner: 'tpl-owner', templateRepo: 'tpl-repo' },
            github,
            createMockLogger(),
        );

        expect(sha).toBe(HEAD_SHA);
        expect(mockReadLkgSha).not.toHaveBeenCalled();
        expect(getLatestCommitSha).toHaveBeenCalledWith('tpl-owner', 'tpl-repo', 'main');
    });

    it("answers the head of the source's own branch when one is named", async () => {
        const { github, getLatestCommitSha } = githubWithHead(async () => HEAD_SHA);

        const sha = await resolveTemplateCommitSha(
            { templateOwner: 'jen', templateRepo: 'isle5-demo', templateBranch: 'demo-2026' },
            github,
            createMockLogger(),
        );

        expect(sha).toBe(HEAD_SHA);
        expect(getLatestCommitSha).toHaveBeenCalledWith('jen', 'isle5-demo', 'demo-2026');
    });

    it('answers nothing when the template branch does not exist', async () => {
        const { github } = githubWithHead(async () => null);

        const sha = await resolveTemplateCommitSha(
            { templateOwner: 'tpl-owner', templateRepo: 'tpl-repo' },
            github,
            createMockLogger(),
        );

        expect(sha).toBeUndefined();
    });

    it('answers nothing, and warns, when the head cannot be fetched', async () => {
        const { github } = githubWithHead(async () => {
            throw new Error('network down');
        });
        const logger = createMockLogger();

        const sha = await resolveTemplateCommitSha(
            { templateOwner: 'tpl-owner', templateRepo: 'tpl-repo' },
            github,
            logger,
        );

        expect(sha).toBeUndefined();
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['owner', { templateRepo: 'tpl-repo', codePatchSource: PATCH_SOURCE }],
        ['repo', { templateOwner: 'tpl-owner', codePatchSource: PATCH_SOURCE }],
    ])('asks nobody when the template %s is unknown', async (_missing, source) => {
        const { github, getLatestCommitSha } = githubWithHead(async () => HEAD_SHA);

        const sha = await resolveTemplateCommitSha(source, github, createMockLogger());

        expect(sha).toBeUndefined();
        expect(mockReadLkgSha).not.toHaveBeenCalled();
        expect(getLatestCommitSha).not.toHaveBeenCalled();
    });
});

describe('a template the builder owns', () => {
    const OWNED = { templateOwner: 'skukla', templateRepo: 'buildright-eds' };

    beforeEach(() => {
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({ get: () => 'stable' });
    });

    it('is at the commit of its newest release, not its branch head', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [{ tag_name: 'v1.1.0' }] });
        const files = { getRefCommit: jest.fn().mockResolvedValue('released'), getLatestCommitSha: jest.fn() };

        const sha = await resolveTemplateCommitSha(OWNED, files, createMockLogger());

        expect(sha).toBe('released');
        expect(files.getRefCommit).toHaveBeenCalledWith('skukla', 'buildright-eds', 'v1.1.0');
        expect(files.getLatestCommitSha).not.toHaveBeenCalled();
    });

    it('is at its branch head until it has a first release', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
        const files = { getRefCommit: jest.fn(), getLatestCommitSha: jest.fn().mockResolvedValue('head') };

        expect(await resolveTemplateCommitSha(OWNED, files, createMockLogger())).toBe('head');
    });
});
