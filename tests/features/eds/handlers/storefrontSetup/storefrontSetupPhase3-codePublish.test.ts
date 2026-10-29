/**
 * Phase 3's code publish, against the two sequences measured on 2026-10-22.
 *
 * Split out of `storefrontSetupPhase3-confirmCodeSync.test.ts` at its 750-line limit;
 * that suite pins the App verdict, this one pins WHEN the code is published and what a
 * failed publish does to the run.
 */

jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

const mockRegister = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/eds/handlers/configServiceRegistration', () => ({
    registerConfigurationService: (...a: unknown[]) => mockRegister(...a),
}));

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    configureDaLivePermissions: jest.fn().mockResolvedValue({ success: true }),
}));

const mockResolve = jest.fn();
jest.mock('@/features/eds/services/appInstallationResolver', () => ({
    ...jest.requireActual('@/features/eds/services/appInstallationResolver'),
    resolveAppInstallation: (...a: unknown[]) => mockResolve(...a),
}));

import { executePhaseCodeSync } from '@/features/eds/handlers/storefrontSetup/storefrontSetupPhase3';
import type { StorefrontSetupStartPayload } from '@/features/eds/handlers/storefrontSetup/storefrontSetupHandlers';
import type {
    RepoInfo,
    SetupServices,
} from '@/features/eds/handlers/storefrontSetup/storefrontSetupTypes';
import { ADMIN_API_401_MESSAGE } from '@/features/eds/services/helix/helixAdminErrors';
import type { HandlerContext } from '@/types/handlers';
import {
    makePhase3Context,
    makePhase3Services,
    progressMessages,
    sentTypes,
} from './storefrontSetupPhase3.testUtils';
import {
    PREVIEW_CODE_APP_NOT_ON_REPO_ERROR,
    PREVIEW_CODE_SITE_NOT_FOUND_ERROR,
} from '../../../../helpers/helixAdminFixtures';

const REPO: RepoInfo = { repoOwner: 'skukla', repoName: 'kukla-bodea' };

/** Records the sequence whose ORDER is the thing under test. */
let order: string[];

const makeContext = makePhase3Context;
const makeServices = (): SetupServices => makePhase3Services(() => order.push('publishCode'));

const EDS_CONFIG = {
    daLiveOrg: 'skukla',
    daLiveSite: 'kukla-bodea',
    repoMode: 'new',
    githubAuth: { user: { login: 'skukla' } },
} as unknown as StorefrontSetupStartPayload['edsConfig'];

const run = (context: HandlerContext, services: SetupServices) =>
    executePhaseCodeSync(context, EDS_CONFIG, services, REPO);

const messages = progressMessages;

beforeEach(() => {
    jest.clearAllMocks();
    order = [];
    mockRegister.mockImplementation(async () => {
        order.push('registerSite');
    });
    mockResolve.mockResolvedValue({ kind: 'installed', codeStatus: 200 });
});

/**
 * The measured sequence, 2026-10-22, creating skukla/scratch-1022 (Debug Logs):
 *
 *   10:12:13.506  Code preview warning: Failed to preview code: 404 Not Found —
 *                 [admin] config for site not found: skukla/scratch-1022
 *   10:12:14-18   PUT config/skukla/sites/scratch-1022.json -> 201, Site registered
 *   10:12:23-26   /status code.status 400 twice -> "undetermined … Setup succeeded"
 *
 * The code publish ran before the site existed, so it could only be refused, and
 * nothing published again. This fake Helix answers exactly that way: refused with
 * the measured error until the site is registered, accepted after.
 */
describe('the code is published to a site that exists', () => {
    function siteAwareServices(): SetupServices {
        const services = makeServices();
        let registered = false;
        mockRegister.mockImplementation(async () => {
            order.push('registerSite');
            registered = true;
        });
        (services.helixService.previewCode as jest.Mock).mockImplementation(async () => {
            order.push('publishCode');
            if (!registered) throw new Error(PREVIEW_CODE_SITE_NOT_FOUND_ERROR);
        });
        return services;
    }

    it('registers the site before the first code publish', async () => {
        await run(makeContext(), siteAwareServices());

        expect(order.indexOf('registerSite')).toBeLessThan(order.indexOf('publishCode'));
    });

    it('so a brand-new site publishes its code on the first try', async () => {
        const services = siteAwareServices();
        const context = makeContext();

        const result = await run(context, services);

        expect(result).toBeNull();
        expect(services.helixService.previewCode).toHaveBeenCalledTimes(1);
        expect(messages(context)).toMatch(/Code synchronized/);
        expect(messages(context)).not.toMatch(/config for site not found/);
    });

    it('reports a site Helix still cannot find, rather than marking it ready', async () => {
        // If registration did not take, the same refusal must reach the SC.
        const services = makeServices();
        (services.helixService.previewCode as jest.Mock).mockRejectedValue(
            new Error(PREVIEW_CODE_SITE_NOT_FOUND_ERROR),
        );
        const context = makeContext();

        const result = await run(context, services);

        expect(result).toMatchObject({
            success: false,
            error: expect.stringContaining('config for site not found'),
        });
        expect(sentTypes(context)).not.toContain('storefront-setup-github-app-required');
        expect(messages(context)).not.toMatch(/Site configuration complete/);
    });
});

/**
 * The measured sequence, 2026-10-22, creating skukla/scratch-1022-b (Debug Logs):
 *
 *   14:54:51.913  PUT config/skukla/sites/scratch-1022-b.json -> 201
 *   14:54:56.352  Pinned an admin on skukla/scratch-1022-b
 *   14:54:56-55:27  code publish: 400 "github bot not installed on repository" (x8)
 *   14:55:32.715  code publish: 401 — and the run failed
 *
 * The 401 arrived 36 seconds after the admin was pinned, inside the documented
 * 30–90s admin-role propagation window, from a publish that already carries the
 * DA.live Bearer. So the setup's publish waits a 401 out instead of failing on it.
 */
describe('a 401 right after the site gained its admin', () => {
    const refused = () => new Error(ADMIN_API_401_MESSAGE);

    it('is waited out, and the code is published', async () => {
        const services = makeServices();
        (services.helixService.previewCode as jest.Mock)
            .mockRejectedValueOnce(refused())
            .mockResolvedValue(undefined);
        const context = makeContext();

        const result = await run(context, services);

        expect(result).toBeNull();
        expect(services.helixService.previewCode).toHaveBeenCalledTimes(2);
        expect(messages(context)).toMatch(/Code synchronized/);
    });

    it('is waited out by the publish that ends the App pause, too', async () => {
        const services = makeServices();
        (services.helixService.previewCode as jest.Mock)
            .mockRejectedValueOnce(new Error(PREVIEW_CODE_APP_NOT_ON_REPO_ERROR))
            .mockRejectedValueOnce(refused())
            .mockResolvedValue(undefined);
        const context = makeContext();

        const result = await run(context, services);

        expect(result).toBeNull();
        expect(services.helixService.previewCode).toHaveBeenCalledTimes(3);
        expect(messages(context)).toMatch(/Site configuration complete/);
    });

    it('still fails the run, with the 401, when it never clears', async () => {
        const services = makeServices();
        (services.helixService.previewCode as jest.Mock).mockRejectedValue(refused());

        const result = await run(makeContext(), services);

        expect(result).toMatchObject({
            success: false,
            error: expect.stringContaining('Adobe rejected the request (401)'),
        });
    });
});
