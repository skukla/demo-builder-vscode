/**
 * repairSiteConfig — re-run one storefront's Configuration Service registration.
 *
 * The properties that matter, and why each is pinned:
 *
 * - `verified` is read back, never inferred. A 2xx write and a live overlay are
 *   different claims; only the second means product pages load.
 * - A 403 is `not_authorized` WITH a Code Sync deep link, because no retry the
 *   user can run will clear it — a human with the role has to act.
 * - A dead DA.live session is `failed`, not `not_authorized`: sending someone to
 *   grant a role they already hold is the wrong remedy.
 * - The admin pin runs only after a successful write, and merges.
 */

import { repairSiteConfig } from '@/features/eds/services/configService/repairSiteConfigHeadless';
import { DaLiveAuthError } from '@/features/eds/services/types';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../../helpers/loggerFake';

const mockRegisterSiteConfig = jest.fn();
const mockPinSiteAdmin = jest.fn();

jest.mock('@/features/eds/services/configService/siteConfigRegistrar', () => ({
    registerSiteConfig: (...args: unknown[]) => mockRegisterSiteConfig(...args),
}));
jest.mock('@/features/eds/services/configService/configAccessRecovery', () => ({
    pinSiteAdmin: (...args: unknown[]) => mockPinSiteAdmin(...args),
}));

const logger = createMockLogger() as unknown as Logger;

/** Mirrors the real shape: `extractRepublishParams` reads the EDS component instance. */
const project = {
    name: 'demo',
    componentInstances: {
        'eds-storefront': {
            path: '/tmp/demo/storefront',
            metadata: {
                githubRepo: 'skukla/demo-builder-test',
                daLiveOrg: 'skukla',
                daLiveSite: 'demo-builder-test',
            },
        },
    },
} as unknown as Project;

const makeService = (overlayUrl?: string, readable = true) =>
    ({
        readSiteOverlayUrl: jest.fn().mockResolvedValue({ readable, overlayUrl }),
    }) as never;

const run = (over: Record<string, unknown> = {}) =>
    repairSiteConfig({
        project,
        configurationService: makeService('https://overlay.example/render-pdp'),
        tokenProvider: {} as never,
        logger,
        userEmail: 'someone@adobe.com',
        resolveOverlayUrl: () => 'https://overlay.example/render-pdp',
        ...over,
    } as never);

describe('repairSiteConfig', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRegisterSiteConfig.mockResolvedValue({ registered: true });
        mockPinSiteAdmin.mockResolvedValue(undefined);
    });

    it('repairs and reports verified when the overlay reads back', async () => {
        const result = await run();

        expect(result.status).toBe('repaired');
        expect(result.verified).toBe(true);
        expect(result.org).toBe('skukla');
        expect(result.site).toBe('demo-builder-test');
    });

    it('reports UNVERIFIED when the write succeeded but no overlay reads back', async () => {
        // The failure this whole flag exists for: Adobe accepted the write and the
        // overlay still is not there, so product pages still will not load.
        const result = await run({ configurationService: makeService(undefined) });

        expect(result.status).toBe('repaired');
        expect(result.verified).toBe(false);
    });

    it('reports UNVERIFIED when the config cannot be read back at all', async () => {
        const result = await run({ configurationService: makeService(undefined, false) });

        expect(result.verified).toBe(false);
    });

    it('counts a readable config as verification when BYOM is off', async () => {
        // No overlay was requested, so finding none is correct — demanding one
        // would report every non-BYOM storefront as broken.
        const result = await run({
            resolveOverlayUrl: () => undefined,
            configurationService: makeService(undefined),
        });

        expect(result.status).toBe('repaired');
        expect(result.verified).toBe(true);
        expect(result.overlayUrl).toBeUndefined();
    });

    it('retries a 403 unconditionally — a repair follows a grant', async () => {
        await run();

        expect(mockRegisterSiteConfig).toHaveBeenCalledWith(
            expect.objectContaining({ retryOn403: true }),
        );
    });

    it('returns not_authorized WITH a setup link on a 403', async () => {
        mockRegisterSiteConfig.mockResolvedValue({ registered: false, statusCode: 403 });

        const result = await run();

        expect(result.status).toBe('not_authorized');
        expect(result.verified).toBe(false);
        expect(result.setupUrl).toContain('demo-builder-test');
        expect(mockPinSiteAdmin).not.toHaveBeenCalled();
    });

    it('returns failed WITHOUT a setup link on a non-403 failure', async () => {
        mockRegisterSiteConfig.mockResolvedValue({ registered: false, statusCode: 500 });

        const result = await run();

        expect(result.status).toBe('failed');
        expect(result.setupUrl).toBeUndefined();
    });

    it('reports lost grants even when the registration FAILED', async () => {
        // The worst outcome in the feature: the config is gone AND the admin list
        // is gone. The restore is attempted even on a failed re-register, so a
        // failure result can carry grants — reporting only "refused the write"
        // would bury the unrecoverable half.
        mockRegisterSiteConfig.mockResolvedValue({
            registered: false,
            statusCode: 500,
            lostGrants: ['a****@x.test'],
        });

        const result = await run();

        expect(result.status).toBe('failed');
        expect(result.lostGrants).toEqual(['a****@x.test']);
    });

    it("prefers the service's own words over a synthesized message", async () => {
        // The capture-refusal text ("Could not read the current site
        // administrators…") never reached anyone while this synthesized over it.
        mockRegisterSiteConfig.mockResolvedValue({
            registered: false,
            statusCode: 500,
            error: 'Could not read the current site administrators',
        });

        const result = await run();

        expect(result.error).toBe('Could not read the current site administrators');
    });

    it('maps a dead DA.live session to failed, not not_authorized', async () => {
        mockRegisterSiteConfig.mockRejectedValue(new DaLiveAuthError('session expired'));

        const result = await run();

        expect(result.status).toBe('failed');
        expect(result.error).toContain('session expired');
    });

    it('refuses a project with no EDS storefront', async () => {
        const result = await run({ project: { name: 'bare' } as unknown as Project });

        expect(result.status).toBe('invalid');
        expect(mockRegisterSiteConfig).not.toHaveBeenCalled();
    });

    it('pins the admin role only after a successful write', async () => {
        await run();

        expect(mockPinSiteAdmin).toHaveBeenCalledWith(
            expect.anything(),
            { owner: 'skukla', repo: 'demo-builder-test' },
            'someone@adobe.com',
            expect.anything(),
        );
    });
});
