/**
 * storefrontSyncService — what a sync REPORTS, and what it does when git refuses.
 *
 * Split from `storefrontSyncService.test.ts` (2026-09-06, PL-22 MUT-07) when the
 * single file passed the 750-line limit. That file drives the happy path and the
 * two push rejections; this one covers the outcomes a caller reads back — the
 * summary line, the committed/published flags, the branch actually published —
 * and the git failures that are neither rejection.
 *
 * The mock preamble lives in `storefrontSyncService.testUtils`, which both import.
 */

import {
    GitOperationError,
    PushRejectedError,
    STOREFRONT,
    defaultExecImpl,
    execFileMock,
    execImpl,
    execImplWithCommitFailure,
    execImplWithPushStderr,
    gitFailure,
    previewMock,
    syncAndPublish,
} from './storefrontSyncService.testUtils';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    clearKeptClash,
    KEPT_CLASH_REFUSAL,
    markKeptClash,
} from '@/features/eds/services/storefront/keptClashMark';

beforeEach(() => {
    jest.clearAllMocks();
    defaultExecImpl();
    previewMock.mockResolvedValue(undefined);
});

describe('staging failures', () => {
    it('wraps a failing git add as a GitOperationError naming the add step', async () => {
        execImpl({
            when: (args) => args.includes('add'),
            error: gitFailure({ stderr: 'fatal: unable to index file blocks/hero/hero.js' }),
        });

        const err = await syncAndPublish({
            storefrontPath: STOREFRONT,
            commitMessage: 'msg',
        }).catch((e: unknown) => e);

        expect(err).toBeInstanceOf(GitOperationError);
        // The operation tag is what a caller branches on, so it is the assertion —
        // not the message, which is git's wording rather than ours.
        expect((err as GitOperationError).operation).toBe('add');
        expect((err as GitOperationError).stderr).toBe(
            'fatal: unable to index file blocks/hero/hero.js'
        );
        // A tree that would not stage must not go on to commit.
        expect(execFileMock.mock.calls.some((c) => c[1].includes('commit'))).toBe(false);
    });
});

describe('commit message sanitisation', () => {
    it('trims the sanitised message instead of leaving edge whitespace', async () => {
        // Newlines become spaces first, so an edge newline leaves whitespace that
        // only the trim removes — a commit subject git would render padded.
        await syncAndPublish({
            storefrontPath: STOREFRONT,
            commitMessage: '\n  padded message  \n',
        });

        const commitCall = execFileMock.mock.calls.find((c) => c[1].includes('commit'));
        expect(commitCall?.[1]).toEqual(['-C', STOREFRONT, 'commit', '-m', 'padded message']);
    });

    it('treats "nothing to commit" reported on stdout as nothing to commit', async () => {
        // git prints it on STDOUT, not stderr. Reading only stderr would turn the
        // commonest no-op sync into a thrown GitOperationError.
        execImpl({
            when: (args) => args.includes('commit'),
            error: gitFailure({ stdout: 'nothing to commit, working tree clean', stderr: '' }),
        });

        const result = await syncAndPublish({
            storefrontPath: STOREFRONT,
            commitMessage: 'msg',
        });

        expect(result.committed).toBe(false);
        expect(execFileMock.mock.calls.some((c) => c[1].includes('push'))).toBe(false);
    });
});

describe('the rebase-recovery path reports what it did', () => {
    it('reports committed=false when skipCommit meant it committed nothing', async () => {
        const result = await syncAndPublish({
            storefrontPath: STOREFRONT,
            commitMessage: 'msg',
            skipCommit: true,
        });

        // It pushed a commit the wrapper already made — this call made none.
        expect(result.committed).toBe(false);
        expect(result.pushed).toBe(true);
    });
});

describe('the branch the Helix chain publishes', () => {
    const REPO_TOKENS = { githubToken: 'gh-token', daLiveToken: 'dalive-ims' };

    it('defaults to main when githubRepo names no branch', async () => {
        await syncAndPublish({
            storefrontPath: STOREFRONT,
            commitMessage: 'msg',
            githubRepo: { owner: 'owner', site: 'repo' },
            ...REPO_TOKENS,
        });

        expect(previewMock).toHaveBeenCalledWith('owner', 'repo', '/', 'main', REPO_TOKENS);
    });

    it('publishes the branch githubRepo names, not the default', async () => {
        await syncAndPublish({
            storefrontPath: STOREFRONT,
            commitMessage: 'msg',
            githubRepo: { owner: 'owner', site: 'repo', branch: 'release' },
            ...REPO_TOKENS,
        });

        expect(previewMock).toHaveBeenCalledWith('owner', 'repo', '/', 'release', REPO_TOKENS);
    });

    it('reports helixPublished=false when the chain was skipped', async () => {
        const result = await syncAndPublish({
            storefrontPath: STOREFRONT,
            commitMessage: 'msg',
            githubRepo: { owner: 'owner', site: 'repo' },
            ...REPO_TOKENS,
            skipHelix: true,
        });

        expect(result.helixPublished).toBe(false);
    });
});

describe('an ordinary push failure is not a rejection', () => {
    it('wraps a credentials failure as GitOperationError, not PushRejectedError', async () => {
        // Neither a ruleset nor a non-fast-forward. Classifying it as a rejection
        // would send the caller into rebase-and-retry, which cannot help.
        execImplWithPushStderr(
            "fatal: could not read Username for 'https://github.com': terminal prompts disabled"
        );

        const err = await syncAndPublish({
            storefrontPath: STOREFRONT,
            commitMessage: 'msg',
        }).catch((e: unknown) => e);

        expect(err).toBeInstanceOf(GitOperationError);
        expect(err).not.toBeInstanceOf(PushRejectedError);
        expect((err as GitOperationError).operation).toBe('push');
    });
});

describe('the summary line', () => {
    // The one string a caller surfaces without inspecting the flags, so each
    // clause has to be earned by the step it names.

    it('names commit, push and publish when all three happened', async () => {
        const result = await syncAndPublish({
            storefrontPath: STOREFRONT,
            commitMessage: 'msg',
            githubRepo: { owner: 'owner', site: 'repo' },
            githubToken: 'gh-token',
            daLiveToken: 'dalive-ims',
        });

        expect(result.summary).toBe('committed; pushed; Helix preview+publish');
    });

    it('omits the publish clause when the Helix chain did not run', async () => {
        const result = await syncAndPublish({
            storefrontPath: STOREFRONT,
            commitMessage: 'msg',
        });

        expect(result.summary).toBe('committed; pushed');
    });

    it('says nothing was committed and push was skipped on a clean tree', async () => {
        execImplWithCommitFailure('nothing to commit, working tree clean');

        const result = await syncAndPublish({
            storefrontPath: STOREFRONT,
            commitMessage: 'msg',
        });

        expect(result.summary).toBe('no changes to commit; push skipped');
    });
});

describe('a kept clash (EDS-57)', () => {
    // A real folder: the mark is a file inside the copy's .git, read from disk.
    let copy: string;
    beforeEach(() => {
        copy = fs.mkdtempSync(path.join(os.tmpdir(), 'kept-clash-sync-'));
        fs.mkdirSync(path.join(copy, '.git'));
    });
    afterEach(() => fs.rmSync(copy, { recursive: true, force: true }));

    it('refuses to sync while a clash is kept in the copy, before running any git', async () => {
        await markKeptClash(copy, 'boilerplate update 71a67e0..48bed04: blocks/header/header.js');

        const err = await syncAndPublish({ storefrontPath: copy, commitMessage: 'msg' }).catch((e: unknown) => e);

        expect(err).toBeInstanceOf(GitOperationError);
        expect((err as GitOperationError).operation).toBe('kept-clash');
        expect((err as GitOperationError).message).toBe(KEPT_CLASH_REFUSAL);
        expect(execFileMock).not.toHaveBeenCalled();
    });

    it('syncs again once the clash is finished or left', async () => {
        await markKeptClash(copy, 'note');
        await clearKeptClash(copy);

        await syncAndPublish({ storefrontPath: copy, commitMessage: 'msg' });

        // Control: the same folder now reaches git.
        expect(execFileMock.mock.calls.some((c) => c[1].includes('commit'))).toBe(true);
    });
});
