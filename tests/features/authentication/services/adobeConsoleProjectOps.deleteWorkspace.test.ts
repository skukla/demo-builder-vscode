/**
 * AdobeConsoleProjectOps.deleteWorkspace — an error is not proof the delete failed.
 *
 * On 2026-09-21 deleting a workspace answered `504 Gateway Timeout ("upstream
 * request timeout")` and the workspace was gone a minute later: Adobe finished the
 * delete after its gateway gave up. The agent was told it failed. So after an error
 * the project's workspace list is read, and a workspace no longer in it is reported
 * deleted — with a note saying Adobe answered with an error, because that is also
 * true. A workspace still listed, or a list that cannot be read, stays a failure.
 */

jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { TARGET, opsWith as buildOps, workspace } from './adobeConsoleProjectOps.testUtils';

const GATEWAY_TIMEOUT = new Error(
    '[CoreConsoleAPISDK:ERROR_DELETE_WORKSPACE] 504 - Gateway Timeout ("upstream request timeout")',
);

const opsWith = (deleteWorkspace: jest.Mock, listWorkspaces: jest.Mock) =>
    buildOps({ deleteWorkspace }, listWorkspaces);

describe('AdobeConsoleProjectOps.deleteWorkspace', () => {
    it('reports a plain success without looking anything up', async () => {
        const list = jest.fn();
        const ops = opsWith(jest.fn().mockResolvedValue({}), list);

        await expect(ops.deleteWorkspace('ws-1', TARGET)).resolves.toEqual({ deleted: true });
        expect(list).not.toHaveBeenCalled();
    });

    it('reports deleted, with a note, when the error came back but the workspace is gone', async () => {
        const list = jest.fn().mockResolvedValue([workspace('ws-stage')]);
        const ops = opsWith(jest.fn().mockRejectedValue(GATEWAY_TIMEOUT), list);

        await expect(ops.deleteWorkspace('ws-1', TARGET)).resolves.toEqual({
            deleted: true,
            note: 'Adobe answered with an error, but the workspace is no longer in the project.',
        });
        expect(list).toHaveBeenCalledWith('org-1', 'proj-1');
    });

    // The second 504 of the day: a look 7s after it still listed the workspace, and
    // it was gone soon after. So it looks again, a few times, before believing it.
    it('keeps looking, and reports deleted when a later look finds it gone', async () => {
        const list = jest
            .fn()
            .mockResolvedValueOnce([workspace('ws-stage'), workspace('ws-1')])
            .mockResolvedValueOnce([workspace('ws-stage'), workspace('ws-1')])
            .mockResolvedValue([workspace('ws-stage')]);
        const ops = opsWith(jest.fn().mockRejectedValue(GATEWAY_TIMEOUT), list);

        await expect(ops.deleteWorkspace('ws-1', TARGET)).resolves.toMatchObject({ deleted: true });
        expect(list).toHaveBeenCalledTimes(3);
        expect(sleep).toHaveBeenCalledWith(TIMEOUTS.WORKSPACE_DELETE_RECHECK);
    });

    it('stays a failure when the workspace is still there at the last look', async () => {
        const list = jest.fn().mockResolvedValue([workspace('ws-stage'), workspace('ws-1')]);
        const ops = opsWith(jest.fn().mockRejectedValue(GATEWAY_TIMEOUT), list);

        await expect(ops.deleteWorkspace('ws-1', TARGET)).resolves.toEqual({
            error: GATEWAY_TIMEOUT.message,
        });
        expect(list).toHaveBeenCalledTimes(5);
    });

    it('stays a failure when the list cannot be read — unknown is not deleted', async () => {
        const list = jest.fn().mockRejectedValue(new Error('503'));
        const ops = opsWith(jest.fn().mockRejectedValue(GATEWAY_TIMEOUT), list);

        await expect(ops.deleteWorkspace('ws-1', TARGET)).resolves.toEqual({
            error: GATEWAY_TIMEOUT.message,
        });
    });
});
