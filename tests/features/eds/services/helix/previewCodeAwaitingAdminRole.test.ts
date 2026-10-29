/**
 * A code publish made seconds after the site gained an admin waits out a 401.
 *
 * Measured 2026-10-22, creating skukla/scratch-1022-b: the site was registered and
 * an admin pinned at 14:54:56, the publish then got the App's 400 eight times, and
 * the first publish after the App was added (14:55:32) got a 401 — with the same
 * Helix service, built on the DA.live token provider, that publishes the code of
 * scratch-1022 from the dashboard's Republish. The documented admin-role
 * propagation window is 30–90s (`CONFIG_SERVICE_PROPAGATION_DELAYS_MS`).
 */

jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

import { sleep } from '@/core/utils/sleep';
import { CONFIG_SERVICE_PROPAGATION_DELAYS_MS } from '@/features/eds/services/configService/siteConfigRegistrar';
import { ADMIN_API_401_MESSAGE } from '@/features/eds/services/helix/helixAdminErrors';
import type { HelixCodePreview } from '@/features/eds/services/helix/helixCapabilities';
import { previewCodeAwaitingAdminRole } from '@/features/eds/services/helix/previewCodeAwaitingAdminRole';
import { createMockLogger } from '../../../../helpers/loggerFake';

const TARGET = { owner: 'skukla', repo: 'scratch-1022-b', path: '/*', branch: 'main' };

function helixAnswering(...answers: Array<Error | undefined>): HelixCodePreview & {
    previewCode: jest.Mock;
} {
    const previewCode = jest.fn();
    for (const answer of answers) {
        if (answer) previewCode.mockRejectedValueOnce(answer);
        else previewCode.mockResolvedValueOnce(undefined);
    }
    return { previewCode };
}

const refused = () => new Error(ADMIN_API_401_MESSAGE);

beforeEach(() => jest.clearAllMocks());

describe('previewCodeAwaitingAdminRole', () => {
    it('publishes once, with the arguments it was given, when Helix accepts', async () => {
        const helix = helixAnswering(undefined);

        await previewCodeAwaitingAdminRole(helix, TARGET, createMockLogger());

        expect(helix.previewCode).toHaveBeenCalledTimes(1);
        expect(helix.previewCode).toHaveBeenCalledWith('skukla', 'scratch-1022-b', '/*', 'main');
        expect(sleep).not.toHaveBeenCalled();
    });

    it('waits out a 401 and publishes when the role has propagated', async () => {
        const helix = helixAnswering(refused(), undefined);

        await previewCodeAwaitingAdminRole(helix, TARGET, createMockLogger());

        expect(helix.previewCode).toHaveBeenCalledTimes(2);
        expect(sleep).toHaveBeenCalledWith(CONFIG_SERVICE_PROPAGATION_DELAYS_MS[0]);
    });

    it('gives up after the propagation window with the 401 itself', async () => {
        const helix = { previewCode: jest.fn().mockRejectedValue(refused()) };

        await expect(
            previewCodeAwaitingAdminRole(helix, TARGET, createMockLogger()),
        ).rejects.toThrow(ADMIN_API_401_MESSAGE);
        expect(helix.previewCode).toHaveBeenCalledTimes(CONFIG_SERVICE_PROPAGATION_DELAYS_MS.length + 1);
    });

    it('does not wait on any other failure — only a 401 is a role still on its way', async () => {
        const helix = { previewCode: jest.fn().mockRejectedValue(new Error('helix 503')) };

        await expect(
            previewCodeAwaitingAdminRole(helix, TARGET, createMockLogger()),
        ).rejects.toThrow('helix 503');
        expect(helix.previewCode).toHaveBeenCalledTimes(1);
        expect(sleep).not.toHaveBeenCalled();
    });
});
