/**
 * Syncing a storefront with its template — the RECORDED VERSION a merge starts from.
 *
 * A merge applies the template's change since the storefront's `lastSyncedCommit`,
 * so before any diff the service has to know that record is usable: present, a
 * commit, and a commit on the template's `main`. These cases pin each refusal and
 * each short-cut (already current; a change that touches only preserved files).
 * The sibling `-plumbing` suite pins the full git conversation of a merge that
 * goes through; `templateMergeBase.test.ts` runs the same flow against real git.
 */

import {
    BASE_SHA,
    REPO_DIR,
    TEMPLATE_HEAD,
    answer,
    edsProject,
    failOn,
    gitCalls,
    happyGit,
    mockExecute,
    mockMkdtemp,
    pushed,
    resetFakes,
    service,
} from './templateSyncService.testUtils';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

const opts = (cwd: string, timeout: number) => ({ cwd, timeout, shell: DEFAULT_SHELL });
const NO_RECORDED = 'This storefront has no recorded template version to update from; '
    + 'reset it to its template once so updates have a starting point.';
const NOT_IN_TEMPLATE = `The storefront's recorded template version (${BASE_SHA}) is not in `
    + "adobe/aem-boilerplate-commerce's history; reset it to its template once so updates "
    + 'have a new starting point.';
/** The merge checks the recorded version is a commit on the template's main. */
const BASE_CHECK_STEPS = [
    [`git cat-file -e "${BASE_SHA}^{commit}"`, opts(REPO_DIR, TIMEOUTS.QUICK)],
    [`git merge-base --is-ancestor ${BASE_SHA} template/main`, opts(REPO_DIR, TIMEOUTS.NORMAL)],
];

beforeEach(() => {
    resetFakes();
});

describe('the recorded version a merge starts from', () => {
    it.each([
        ['absent', undefined],
        ['not a commit sha', 'main'],
    ])('a recorded version that is %s: refuses before making a temp dir', async (_label, recorded) => {
        const result = await service().syncWithTemplate(
            edsProject({ lastSyncedCommit: recorded }),
            { strategy: 'merge' },
        );

        expect(result).toEqual({ success: false, strategy: 'merge', syncedCommit: '', error: NO_RECORDED });
        expect(mockMkdtemp).not.toHaveBeenCalled();
        expect(mockExecute).not.toHaveBeenCalled();
    });

    it('a reset needs no recorded version', async () => {
        const result = await service().syncWithTemplate(
            edsProject({ lastSyncedCommit: undefined }),
            { strategy: 'reset' },
        );

        expect(result).toEqual({ success: true, strategy: 'reset', syncedCommit: TEMPLATE_HEAD });
    });

    it('a recorded version not in the clone is fetched by sha, then checked again', async () => {
        let probes = 0;
        mockExecute.mockImplementation(async (cmd: string) =>
            /git cat-file -e/.test(cmd) && probes++ === 0
                ? { code: 1, stdout: '', stderr: 'missing' }
                : happyGit(cmd),
        );

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        expect(mockExecute.mock.calls.slice(3, 7)).toEqual([
            BASE_CHECK_STEPS[0],
            [`git fetch template ${BASE_SHA}`, opts(REPO_DIR, TIMEOUTS.LONG)],
            BASE_CHECK_STEPS[0],
            BASE_CHECK_STEPS[1],
        ]);
        expect(result).toMatchObject({ success: true, syncedCommit: TEMPLATE_HEAD });
    });

    it.each([
        ['absent even after fetching it', /git cat-file -e/],
        ["not an ancestor of the template's main", /merge-base --is-ancestor/],
    ])('a recorded version %s: fails with the reset-once sentence, pushes nothing', async (_label, pattern) => {
        failOn(pattern);

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        expect(result).toEqual({ success: false, strategy: 'merge', syncedCommit: '', error: NOT_IN_TEMPLATE });
        expect(gitCalls()).not.toContainEqual(expect.stringMatching(/diff-tree|git apply/));
        expect(pushed()).toBe(false);
    });

    it('already at the template head: succeeds without diffing or pushing', async () => {
        const result = await service().syncWithTemplate(
            edsProject({ lastSyncedCommit: TEMPLATE_HEAD }),
            { strategy: 'merge' },
        );

        expect(result).toEqual({ success: true, strategy: 'merge', syncedCommit: TEMPLATE_HEAD });
        expect(gitCalls()).not.toContainEqual(expect.stringMatching(/diff-tree|git apply/));
        expect(pushed()).toBe(false);
    });

    it('a template change that touches only preserved files: succeeds without applying or pushing', async () => {
        answer(/diff-tree -r --name-only/, '\n');

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        expect(result).toEqual({ success: true, strategy: 'merge', syncedCommit: TEMPLATE_HEAD });
        expect(gitCalls()).not.toContainEqual(expect.stringMatching(/--output=|git apply/));
        expect(pushed()).toBe(false);
    });
});
