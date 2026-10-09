/**
 * AdobeConsoleExtensionPoints — a workspace's published extension points.
 *
 * `aio app deploy` publishes an app's extension points (the Admin UI SDK registration
 * behind a Commerce grid column) on its workspace in Adobe's registry; `aio app
 * undeploy` is what unpublishes them, and it exits 0 whether or not it did. On
 * 2026-10-08 two deployments of the ERP integration in one Adobe project showed its
 * columns twice in Commerce. So a removal READS the registry, drops what the app
 * declared, and believes only a re-read. These ops are that read and that write,
 * mirrored from the CLI's own `removeSelectedExtensionPoints`.
 */

import { AdobeConsoleExtensionPoints } from '@/features/authentication/services/adobeConsoleExtensionPoints';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import { TARGET } from './adobeConsoleProjectOps.testUtils';
import { READ_ONLY_PROJECT_REFUSAL } from '../../../helpers/adobeConsoleRefusals';
import { ADMIN_UI_POINT, ONLY_OTHER, OTHER_POINT, TWO_POINTS } from '../../../helpers/workspaceEndpointsFixtures';

const WS = 'ws-erp';

/** The ops over a fake Console client holding just the two registry methods; the cache answers nothing. */
function registry(get: jest.Mock, update: jest.Mock = jest.fn().mockResolvedValue({ body: {} })) {
    const sdkClient = {
        isInitialized: jest.fn().mockReturnValue(true),
        ensureInitialized: jest.fn().mockResolvedValue(true),
        getClient: jest.fn().mockReturnValue({ getEndPointsInWorkspace: get, updateEndPointsInWorkspace: update }),
    } as unknown as AdobeSDKClient;
    const cacheManager = { getCachedOrganization: jest.fn(), getCachedProject: jest.fn() } as unknown as AuthCacheManager;
    return { ops: new AdobeConsoleExtensionPoints(sdkClient, cacheManager), get, update };
}

describe('AdobeConsoleExtensionPoints.listWorkspaceExtensionPoints', () => {
    it('answers the point ids the registry holds, read for this org, project and workspace', async () => {
        const { ops, get } = registry(jest.fn().mockResolvedValue({ body: TWO_POINTS }));

        await expect(ops.listWorkspaceExtensionPoints(WS, TARGET)).resolves.toStrictEqual([
            ADMIN_UI_POINT,
            OTHER_POINT,
        ]);
        expect(get).toHaveBeenCalledWith('org-1', 'proj-1', WS);
    });

    it('answers nothing for a workspace that published nothing (Adobe sends a null body)', async () => {
        const { ops } = registry(jest.fn().mockResolvedValue({ body: null }));

        await expect(ops.listWorkspaceExtensionPoints(WS, TARGET)).resolves.toStrictEqual([]);
    });

    it("refuses without a workspace id, before reaching Adobe", async () => {
        const { ops, get } = registry(jest.fn());

        await expect(ops.listWorkspaceExtensionPoints('', TARGET)).resolves.toEqual({
            error: 'A workspace id is required.',
        });
        expect(get).not.toHaveBeenCalled();
    });

    it("surfaces Adobe's own reason when the read fails", async () => {
        const { ops } = registry(jest.fn().mockRejectedValue(new Error('503 - Service Unavailable')));

        await expect(ops.listWorkspaceExtensionPoints(WS, TARGET)).resolves.toEqual({
            error: '503 - Service Unavailable',
        });
    });
});

describe('AdobeConsoleExtensionPoints.removeWorkspaceExtensionPoints', () => {
    it('writes back the registry minus the given points, and answers what a RE-READ holds', async () => {
        const get = jest
            .fn()
            .mockResolvedValueOnce({ body: TWO_POINTS })
            .mockResolvedValueOnce({ body: ONLY_OTHER });
        const { ops, update } = registry(get);

        const result = await ops.removeWorkspaceExtensionPoints(WS, [ADMIN_UI_POINT], TARGET);

        expect(update).toHaveBeenCalledWith('org-1', 'proj-1', WS, ONLY_OTHER);
        expect(get).toHaveBeenCalledTimes(2);
        expect(result).toStrictEqual({ remaining: [OTHER_POINT] });
    });

    it('answers the point as remaining when the re-read still holds it, whatever the write said', async () => {
        const get = jest.fn().mockResolvedValue({ body: TWO_POINTS });
        const { ops } = registry(get);

        const result = await ops.removeWorkspaceExtensionPoints(WS, [ADMIN_UI_POINT], TARGET);

        expect(result).toStrictEqual({ remaining: [ADMIN_UI_POINT, OTHER_POINT] });
    });

    it('writes an empty map when the given points were all there was', async () => {
        const get = jest
            .fn()
            .mockResolvedValueOnce({ body: { [ADMIN_UI_POINT]: {} } })
            .mockResolvedValueOnce({ body: {} });
        const { ops, update } = registry(get);

        const result = await ops.removeWorkspaceExtensionPoints(WS, [ADMIN_UI_POINT], TARGET);

        expect(update).toHaveBeenCalledWith('org-1', 'proj-1', WS, {});
        expect(result).toStrictEqual({ remaining: [] });
    });

    it('says in plain words why Adobe refused the write in a read-only project', async () => {
        const get = jest.fn().mockResolvedValue({ body: TWO_POINTS });
        const update = jest.fn().mockRejectedValue(new Error(READ_ONLY_PROJECT_REFUSAL));
        const { ops } = registry(get, update);

        const result = await ops.removeWorkspaceExtensionPoints(WS, [ADMIN_UI_POINT], TARGET);

        expect(result).toEqual({ error: expect.stringContaining('not a developer on every product profile') });
    });

    it('uses the cached org and project when no target is given', async () => {
        const get = jest.fn().mockResolvedValue({ body: {} });
        const { ops } = registry(get);
        // The cache answers nothing, so this is the refusal that proves the cache was asked.
        await expect(ops.removeWorkspaceExtensionPoints(WS, [ADMIN_UI_POINT])).resolves.toEqual({
            error: 'No organization or project selected.',
        });
        expect(get).not.toHaveBeenCalled();
    });
});
