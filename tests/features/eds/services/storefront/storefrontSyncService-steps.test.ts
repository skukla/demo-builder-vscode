/**
 * The steps a sync names as it moves on (progress vocabulary slice 2, owner
 * 2026-10-16). The push and the code publish ran under "Saving your changes" because
 * the service said nothing once it started; now it names each as it begins, so the
 * progress modal's line 1 is the step actually running.
 */

import {
    STOREFRONT,
    defaultExecImpl,
    execFileMock,
    execImplWithCommitFailure,
    previewMock,
    syncAndPublish,
} from './storefrontSyncService.testUtils';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import type { SyncAndPublishInput } from '@/features/eds/services/storefront/storefrontSyncService';

type ExecCallback = (err: Error | null, out?: { stdout: string; stderr: string }) => void;

/** Steps, the git push and the code publish, in the order they happened. */
function recordOrder(): string[] {
    const order: string[] = [];
    const answer = execFileMock.getMockImplementation() as (cmd: string, args: string[], cb: ExecCallback) => void;
    execFileMock.mockImplementation((cmd: string, args: string[], cb: ExecCallback) => {
        if (args.includes('push')) order.push('git push');
        answer(cmd, args, cb);
    });
    previewMock.mockImplementation(async () => {
        order.push('code publish');
    });
    return order;
}

const PUBLISHABLE: SyncAndPublishInput = {
    storefrontPath: STOREFRONT,
    commitMessage: 'msg',
    githubRepo: { owner: 'demo-org', site: 'demo-repo' },
    githubToken: 'gh-token-abc',
    daLiveToken: 'da-token',
};

beforeEach(() => {
    jest.clearAllMocks();
    defaultExecImpl();
});

describe('syncAndPublish — the steps it names', () => {
    it('names the push before pushing and the code publish before publishing', async () => {
        const order = recordOrder();

        await syncAndPublish({ ...PUBLISHABLE, onStep: (step) => order.push(step) });

        expect(order).toStrictEqual([
            OPERATION_STAGES.pushingToGitHub.label,
            'git push',
            OPERATION_STAGES.publishingCode.label,
            'code publish',
        ]);
    });

    it('names no publish when there is nothing to publish with', async () => {
        const onStep = jest.fn();

        await syncAndPublish({ storefrontPath: STOREFRONT, commitMessage: 'msg', onStep });

        expect(onStep.mock.calls).toStrictEqual([[OPERATION_STAGES.pushingToGitHub.label]]);
    });

    it('names nothing after the save when there was nothing to commit', async () => {
        execImplWithCommitFailure('nothing to commit, working tree clean');
        const onStep = jest.fn();

        await syncAndPublish({ ...PUBLISHABLE, onStep });

        expect(onStep).not.toHaveBeenCalled();
    });
});
