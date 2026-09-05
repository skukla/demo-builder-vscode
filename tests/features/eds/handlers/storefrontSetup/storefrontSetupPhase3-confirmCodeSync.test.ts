/**
 * AEM Code Sync is verified AFTER the site exists — and says so when it passes.
 *
 * Every earlier check in this pipeline asked before there was anything to ask
 * about. `admin.hlx.page/status` reports on the SITE, and in Helix 5 a site is a
 * Configuration Service record created by `registerConfigurationService`.
 * Measured on skukla/kukla-bodea 2026-08-20:
 *
 *   14:33:27.865  [ConfigAccess] access indeterminate (404)   <- no site
 *   14:33:34.018  PUT /config/skukla/sites/kukla-bodea.json -> 201 OK
 *   ... and /status went 404 -> 401, aem.page 404 -> 200
 *
 * Two things are pinned here.
 *
 * ORDER: the check must run after registration. Run before it, `installed=false`
 * is guaranteed and meaningless — which is how a user whose App was installed
 * the whole time was told eleven times to install it.
 *
 * SUCCESS IS REPORTED: a check that only speaks when it fails cannot be told
 * apart from one that never ran. That ambiguity is most of what made this hard
 * to diagnose, and it was raised as "I expected to see it verified at some
 * point" before this test existed.
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
import { configureDaLivePermissions } from '@/features/eds/handlers/edsHelpers';
import type { StorefrontSetupStartPayload } from '@/features/eds/handlers/storefrontSetup/storefrontSetupHandlers';
import type {
    RepoInfo,
    SetupServices,
} from '@/features/eds/handlers/storefrontSetup/storefrontSetupTypes';
import type { HandlerContext } from '@/types/handlers';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';

const REPO: RepoInfo = {
    repoOwner: 'skukla',
    repoName: 'kukla-bodea',
    repoUrl: 'https://github.com/skukla/kukla-bodea',
};

/** Records the sequence whose ORDER is the thing under test. */
let order: string[];

function makeContext(): HandlerContext {
    return createMockHandlerContext({
        logger: createMockLogger(),
        sendMessage: jest.fn().mockResolvedValue(undefined),
    });
}

function makeServices(): SetupServices {
    return {
        helixService: { previewCode: jest.fn().mockResolvedValue(undefined) },
        daLiveAuthService: { getUserEmail: jest.fn().mockResolvedValue('k@adobe.com') },
        daLiveTokenProvider: {},
        githubAppService: {
            isAppInstalled: jest.fn().mockResolvedValue({ isInstalled: true, codeStatus: 200 }),
            getInstallUrl: jest.fn().mockReturnValue('https://github.com/apps/aem-code-sync'),
        },
    } as unknown as SetupServices;
}

const EDS_CONFIG = {
    daLiveOrg: 'skukla',
    daLiveSite: 'kukla-bodea',
    repoMode: 'existing',
    githubAuth: { user: { login: 'skukla' } },
} as unknown as StorefrontSetupStartPayload['edsConfig'];

const TEAM_ORG_CONFIG = {
    ...EDS_CONFIG,
    githubAuth: { user: { login: 'someone-else' } },
} as unknown as StorefrontSetupStartPayload['edsConfig'];

const run = (context: HandlerContext, services: SetupServices, edsConfig = EDS_CONFIG) =>
    executePhaseCodeSync(context, edsConfig, services, REPO);

const appRequiredPayload = (context: HandlerContext): { message: string; isTeamOrg?: boolean } => {
    const send = context.sendMessage as unknown as jest.Mock;
    return send.mock.calls.find((c) => c[0] === 'storefront-setup-github-app-required')?.[1];
};

const messages = (context: HandlerContext): string =>
    (context.sendMessage as unknown as jest.Mock).mock.calls
        .filter((c) => c[0] === 'storefront-setup-progress')
        .map((c) => String((c[1] as { message?: string }).message))
        .join('\n');

const progressPayloads = (context: HandlerContext): unknown[] =>
    (context.sendMessage as unknown as jest.Mock).mock.calls
        .filter((c) => c[0] === 'storefront-setup-progress')
        .map((c) => c[1]);

const mockConfigurePermissions = configureDaLivePermissions as jest.Mock;

const REPO_LABEL = 'skukla/kukla-bodea';

const sentTypes = (context: HandlerContext): string[] =>
    (context.sendMessage as unknown as jest.Mock).mock.calls.map((c) => c[0] as string);

beforeEach(() => {
    jest.clearAllMocks();
    order = [];
    mockRegister.mockImplementation(async () => {
        order.push('registerSite');
    });
    mockResolve.mockImplementation(async () => {
        order.push('appCheck');
        return { kind: 'installed', codeStatus: 200 };
    });
});

describe('the App verdict waits for the site', () => {
    it('checks AFTER registration, the first moment /status can answer', async () => {
        const context = makeContext();

        await run(context, makeServices());

        expect(order).toEqual(['registerSite', 'appCheck']);
    });

    it('tells the resolver the site was just created, so a lagging code sync is not a verdict', async () => {
        // Assert the ARGUMENT: the resolver is mocked, so it answers the same
        // either way. Without the flag, code sync trailing a seconds-old site
        // reads as a missing App.
        const context = makeContext();

        await run(context, makeServices());

        expect(mockResolve).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.anything(),
            { awaitRegistration: true }
        );
    });
});

describe('saying so when it passes', () => {
    it('reports success, so "verified" is distinguishable from "never ran"', async () => {
        const context = makeContext();

        const result = await run(context, makeServices());

        expect(result).toBeNull();
        expect(messages(context)).toMatch(/AEM Code Sync verified/i);
    });
});

describe('the one failure that earns a halt', () => {
    it('halts on an inner code.status 404 — Helix HAS the site and reports no sync', async () => {
        mockResolve.mockResolvedValue({ kind: 'not-installed', codeStatus: 404 });
        const context = makeContext();

        const result = await run(context, makeServices());

        expect(result).toMatchObject({ success: false, awaitingGitHubApp: true });
        expect(sentTypes(context)).toContain('storefront-setup-github-app-required');
    });

    it('does NOT halt when the check merely failed', async () => {
        // A refused credential says nothing about the App, and setup has
        // otherwise succeeded. Blocking here is the eleven-reinstalls bug.
        mockResolve.mockResolvedValue({ kind: 'undetermined', httpStatus: 401 });
        const context = makeContext();

        const result = await run(context, makeServices());

        expect(result).toBeNull();
        expect(sentTypes(context)).not.toContain('storefront-setup-github-app-required');
        expect(messages(context)).toMatch(/could not verify/i);
    });

    it('does NOT halt on a site Helix still cannot place', async () => {
        // An outer 404 after registration is a settling site, not a missing App.
        mockResolve.mockResolvedValue({
            kind: 'not-installed',
            httpStatus: 404,
            codeStatus: undefined,
        });
        const context = makeContext();

        const result = await run(context, makeServices());

        expect(result).toBeNull();
        expect(sentTypes(context)).not.toContain('storefront-setup-github-app-required');
    });
});

describe('who can actually fix it', () => {
    /**
     * Carried over from the pre-registration gate this replaced. An SC can
     * install a GitHub App on their own account but usually cannot on an
     * organization, so the org case has to point at an admin instead of
     * implying they can do it themselves.
     *
     * What is NEW is that the message can state the cause outright. Every
     * earlier version hedged ("the usual cause is...") because it was reading a
     * missing SITE and inferring a missing App. Here Helix has the site and
     * reports code.status 404, which is a measurement about code sync.
     */
    beforeEach(() => {
        mockResolve.mockResolvedValue({ kind: 'not-installed', codeStatus: 404 });
    });

    it('tells an org user to ask their admin', async () => {
        const context = makeContext();

        await run(context, makeServices(), TEAM_ORG_CONFIG);

        // The org/own-repo distinction is observable in the message itself;
        // the isTeamOrg flag that used to ride along was never read webview-side
        // and was deleted by the 2026-08-21 channel inventory.
        const payload = appRequiredPayload(context);
        expect(payload.message).toMatch(/admin rights/i);
    });

    it('does not send someone chasing an admin for their own repository', async () => {
        const context = makeContext();

        await run(context, makeServices());

        const payload = appRequiredPayload(context);
        expect(payload.message).not.toMatch(/admin rights/i);
    });

    it('states the cause outright, because this one is measured', async () => {
        const context = makeContext();

        await run(context, makeServices());

        // No "the usual cause is" hedging: Helix HAS the site and reports no
        // code sync for it.
        expect(appRequiredPayload(context).message).not.toMatch(/usual cause/i);
    });
});

/**
 * The phase AROUND the verdict.
 *
 * Everything this phase does reaches the outside world as an ARGUMENT — the
 * progress payloads the webview renders, the repo coordinates handed to Helix,
 * the email handed to the DA.live permissions call. A mocked collaborator
 * answers the same whatever it is passed, so asserting what came back says
 * nothing about whether the call was well formed.
 */
describe('what the phase reports and calls', () => {
    it('reports each step in order, naming the repo it is working on', async () => {
        const context = makeContext();

        await run(context, makeServices());

        expect(progressPayloads(context)).toEqual([
            {
                phase: 'code-sync',
                message: expect.stringContaining('Verifying code synchronization'),
                subMessage: REPO_LABEL,
                progress: 40,
            },
            {
                phase: 'code-sync',
                message: expect.stringContaining('Publishing code to CDN'),
                subMessage: REPO_LABEL,
                progress: 43,
            },
            { phase: 'code-sync', message: expect.stringContaining('Code synchronized'), progress: 45 },
            {
                phase: 'site-config',
                message: expect.stringContaining('Configuring site permissions'),
                subMessage: REPO_LABEL,
                progress: 46,
            },
            {
                phase: 'site-config',
                message: expect.stringContaining('Verifying AEM Code Sync'),
                subMessage: REPO_LABEL,
                progress: 48,
            },
            {
                phase: 'site-config',
                message: expect.stringContaining('AEM Code Sync verified'),
                progress: 48,
            },
            {
                phase: 'site-config',
                message: expect.stringContaining('Site configuration complete'),
                progress: 49,
            },
        ]);
    });

    it('publishes the whole repo from main to the CDN', async () => {
        const services = makeServices();

        await run(makeContext(), services);

        expect(services.helixService.previewCode).toHaveBeenCalledWith(
            'skukla',
            'kukla-bodea',
            '/*',
            'main'
        );
    });

    it('carries on when the CDN preview fails — the code is on GitHub either way', async () => {
        const services = makeServices();
        (services.helixService.previewCode as jest.Mock).mockRejectedValue(new Error('helix 503'));
        const context = makeContext();

        const result = await run(context, services);

        expect(result).toBeNull();
        expect(messages(context)).toMatch(/Code synchronized/);
    });
});

describe('who the DA.live site is opened up to', () => {
    it('grants permissions to the signed-in DA.live user', async () => {
        const services = makeServices();

        await run(makeContext(), services);

        expect(mockConfigurePermissions).toHaveBeenCalledWith(
            services.daLiveTokenProvider,
            'skukla',
            'kukla-bodea',
            'k@adobe.com',
            expect.anything()
        );
    });

    it('falls back to the GitHub account email when DA.live has none', async () => {
        const services = makeServices();
        (services.daLiveAuthService.getUserEmail as jest.Mock).mockResolvedValue(undefined);
        const config = {
            ...EDS_CONFIG,
            githubAuth: { user: { login: 'skukla', email: 'gh@example.com' } },
        } as unknown as StorefrontSetupStartPayload['edsConfig'];

        await run(makeContext(), services, config);

        expect(mockConfigurePermissions).toHaveBeenCalledWith(
            expect.anything(),
            'skukla',
            'kukla-bodea',
            'gh@example.com',
            expect.anything()
        );
    });

    it('skips permissions when no email is known anywhere, without failing the phase', async () => {
        const services = makeServices();
        (services.daLiveAuthService.getUserEmail as jest.Mock).mockResolvedValue(undefined);
        const config = {
            daLiveOrg: 'skukla',
            daLiveSite: 'kukla-bodea',
            repoMode: 'existing',
        } as unknown as StorefrontSetupStartPayload['edsConfig'];

        const result = await run(makeContext(), services, config);

        expect(result).toBeNull();
        expect(mockConfigurePermissions).not.toHaveBeenCalled();
    });

    it('skips permissions when the GitHub record carries no user', async () => {
        const services = makeServices();
        (services.daLiveAuthService.getUserEmail as jest.Mock).mockResolvedValue(undefined);
        const config = {
            ...EDS_CONFIG,
            githubAuth: {},
        } as unknown as StorefrontSetupStartPayload['edsConfig'];

        const result = await run(makeContext(), services, config);

        expect(result).toBeNull();
        expect(mockConfigurePermissions).not.toHaveBeenCalled();
    });

    it('surfaces a partial permissions result through the UI and keeps going', async () => {
        mockConfigurePermissions.mockResolvedValueOnce({
            success: false,
            error: 'not a site admin',
        });
        const context = makeContext();

        const result = await run(context, makeServices());

        expect(result).toBeNull();
        expect(progressPayloads(context)).toContainEqual({
            phase: 'site-config',
            message: expect.stringContaining('Permissions partially configured: not a site admin'),
            progress: 47,
        });
    });
});

describe('the App-required payload', () => {
    beforeEach(() => {
        mockResolve.mockResolvedValue({ kind: 'not-installed', codeStatus: 404 });
    });

    it('names the repo and the install URL, and does not claim the site is unregistered', async () => {
        // siteUnregistered says the SITE is missing. Here Helix has the site and
        // reports code.status 404, so claiming otherwise would send the webview
        // down the wrong recovery path.
        const context = makeContext();

        await run(context, makeServices());

        expect(appRequiredPayload(context)).toEqual({
            owner: 'skukla',
            repo: 'kukla-bodea',
            installUrl: 'https://github.com/apps/aem-code-sync',
            siteUnregistered: false,
            message: expect.any(String),
        });
    });

    it('does not chase an admin when the GitHub identity is unknown', async () => {
        const context = makeContext();
        const config = {
            daLiveOrg: 'skukla',
            daLiveSite: 'kukla-bodea',
            repoMode: 'existing',
        } as unknown as StorefrontSetupStartPayload['edsConfig'];

        const result = await run(context, makeServices(), config);

        expect(result).toMatchObject({ awaitingGitHubApp: true });
        expect(appRequiredPayload(context).message).not.toMatch(/admin rights/i);
    });

    it('does not chase an admin when the GitHub record carries no user', async () => {
        const context = makeContext();
        const config = {
            ...EDS_CONFIG,
            githubAuth: {},
        } as unknown as StorefrontSetupStartPayload['edsConfig'];

        const result = await run(context, makeServices(), config);

        expect(result).toMatchObject({ awaitingGitHubApp: true });
        expect(appRequiredPayload(context).message).not.toMatch(/admin rights/i);
    });
});
