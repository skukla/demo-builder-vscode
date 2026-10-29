/**
 * firstUsableDaLiveToken — the DA.live session's token before the Adobe IMS one.
 *
 * Shared by the agent's DA.live tools and the "Manage DA.live Sites" command. The
 * order matters: DA.live and the Helix unpublish refuse the IMS token where they
 * accept the session's (measured 2026-09-12).
 */

import { firstUsableDaLiveToken } from '@/features/eds/services/daLive/daLiveTokenChain';

const session = (token: string | null) => () => ({ getAccessToken: jest.fn(async () => token) });
const ims = (valid: boolean, token = 'ims-token') => () => ({
    inspectToken: jest.fn(async () => ({ valid, token })),
});

describe('firstUsableDaLiveToken', () => {
    it('uses the DA.live session when it holds a token', async () => {
        const provider = await firstUsableDaLiveToken({ daLiveSession: session('dalive-token'), imsTokenManager: ims(true) });

        await expect(provider?.getAccessToken()).resolves.toBe('dalive-token');
    });

    it('falls back to IMS when the session has no token', async () => {
        const provider = await firstUsableDaLiveToken({ daLiveSession: session(null), imsTokenManager: ims(true) });

        await expect(provider?.getAccessToken()).resolves.toBe('ims-token');
    });

    it('falls back to IMS when the session lookup throws', async () => {
        const provider = await firstUsableDaLiveToken({
            daLiveSession: () => {
                throw new Error('no extension context');
            },
            imsTokenManager: ims(true),
        });

        await expect(provider?.getAccessToken()).resolves.toBe('ims-token');
    });

    it('returns null when neither is usable', async () => {
        await expect(
            firstUsableDaLiveToken({ daLiveSession: session(null), imsTokenManager: ims(false) }),
        ).resolves.toBeNull();
        await expect(
            firstUsableDaLiveToken({
                daLiveSession: session(null),
                imsTokenManager: () => {
                    throw new Error('no ServiceLocator');
                },
            }),
        ).resolves.toBeNull();
    });
});
