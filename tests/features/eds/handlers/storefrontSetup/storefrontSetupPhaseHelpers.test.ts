/**
 * Storefront Setup Phase Helpers — existing-repo GitHub App gate
 *
 * Regression coverage for the false-negative that told users to install a
 * GitHub App that was already installed and working.
 *
 * Field case (2026-07-24): AEM Code Sync was installed and serving the user's
 * repo — `main--<repo>--<owner>.aem.page/scripts/aem.js` returned 200, and the
 * files the setup run had just pushed were being served. Setup still failed
 * eleven consecutive times with "GitHub App installation required", because
 * `admin.hlx.page/status` answered HTTP 401 (`[admin] not authenticated`) and
 * the gate treated every non-200 as "not installed". The user reinstalled the
 * App repeatedly; nothing could have changed the outcome.
 *
 * The gate must distinguish:
 *   - Helix says the repo is unknown (HTTP 404 / code.status 404) → really not
 *     installed → show the install prompt.
 *   - Helix refuses to answer (401/403/5xx/network) → undeterminable → retry
 *     once, then fail with a message naming the real problem. Never claim the
 *     App is missing on evidence that says nothing about the App.
 */

// Delays in this path are real wall-clock waits on the node project's real timers.
// Mocking the shared sleep keeps the orchestration under test and drops the waiting.
// Assertions here pin the SEQUENCE of attempts, never elapsed duration.
jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

import { checkGitHubAppForExistingRepo } from '@/features/eds/handlers/storefrontSetup/storefrontSetupPhaseHelpers';
import type { RepoInfo, SetupServices } from '@/features/eds/handlers/storefrontSetup/storefrontSetupTypes';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../../helpers/loggerFake';


const REPO_INFO: RepoInfo = {
    repoOwner: 'acme-demos',
    repoName: 'aircraft-demo',
    repoUrl: 'https://github.com/acme-demos/aircraft-demo',
};

const INSTALL_URL = 'https://github.com/apps/aem-code-sync/installations/select_target';

function makeContext(): HandlerContext {
    return {
        logger: createMockLogger() as unknown as Logger,
        sendMessage: jest.fn().mockResolvedValue(undefined),
    } as unknown as HandlerContext;
}

/** Build services whose `isAppInstalled` returns the given results in order. */
function makeServices(...results: Array<Record<string, unknown>>): SetupServices {
    const isAppInstalled = jest.fn();
    results.forEach((r) => isAppInstalled.mockResolvedValueOnce(r));
    // Repeat the last result for any further calls.
    isAppInstalled.mockResolvedValue(results[results.length - 1]);

    return {
        githubAppService: {
            isAppInstalled,
            getInstallUrl: jest.fn().mockReturnValue(INSTALL_URL),
        },
    } as unknown as SetupServices;
}

/** The payload of the first message of `type` that was sent. */
function sentPayload(context: HandlerContext, type: string): unknown {
    const send = context.sendMessage as unknown as jest.Mock;
    const call = send.mock.calls.find((c) => c[0] === type);
    return call?.[1];
}

function sentMessageTypes(context: HandlerContext): string[] {
    return (context.sendMessage as jest.Mock).mock.calls.map((c) => c[0] as string);
}

describe('checkGitHubAppForExistingRepo', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('App is installed', () => {
        it('returns null so setup continues', async () => {
            const context = makeContext();
            const services = makeServices({ isInstalled: true, codeStatus: 200 });

            const result = await checkGitHubAppForExistingRepo(context, services, REPO_INFO);

            expect(result).toBeNull();
            expect(sentMessageTypes(context)).not.toContain('storefront-setup-github-app-required');
        });
    });

    describe('Helix definitively reports the repo as unknown', () => {
        it('prompts to install when code.status is 404', async () => {
            const context = makeContext();
            const services = makeServices({ isInstalled: false, codeStatus: 404 });

            const result = await checkGitHubAppForExistingRepo(context, services, REPO_INFO);

            expect(result?.success).toBe(false);
            expect(result?.error).toBe('GitHub App installation required');
            expect(sentMessageTypes(context)).toContain('storefront-setup-github-app-required');
        });

        it('says the App is missing only when Helix KNOWS the site', async () => {
            // `code.status: 404` is the measurement: Helix has the site and
            // reports no code sync for it. Only this one earns the claim.
            const context = makeContext();
            const services = makeServices({ isInstalled: false, codeStatus: 404 });

            await checkGitHubAppForExistingRepo(context, services, REPO_INFO);

            expect(sentPayload(context, 'storefront-setup-github-app-required')).toMatchObject({
                siteUnregistered: false,
            });
        });
    });

    describe('Helix has no SITE for the repo (the outer 404)', () => {
        /**
         * `/status` reports on the SITE, not the App. A repo Helix has never
         * registered answers HTTP 404 however AEM Code Sync is configured.
         *
         * Measured on skukla/kukla-bodea 2026-08-20: GitHub listed the repo
         * under the AEM Code Sync installation, and this endpoint 404'd anyway
         * -- 28 minutes after a code-sync trigger Helix had accepted, so not lag
         * either. It was still collapsed into "not installed", so the halt told
         * someone to install an App they had, and the only action on screen
         * could not have changed the outcome. The same conflation as the 401
         * this file was written for, one endpoint layer up.
         */
        const outer404 = () =>
            makeServices({ isInstalled: false, httpNotFound: true, httpStatus: 404 });

        it('does NOT halt — the question has no answer yet, so it is not a verdict', async () => {
            // In Helix 5 a "site" is a Configuration Service record, and nothing
            // before `registerConfigurationService` (Phase 3) creates one. So a
            // first-time setup ALWAYS 404s here, App installed or not, and this
            // gate could only ever pass for a repo that was already a registered
            // site. Halting on it blocked every first-time existing-repo run.
            //
            // Measured unauthenticated, where 401 means the site exists (auth is
            // checked before existence) and 404 means it does not:
            //   skukla/kukla-bodea       404  <- App installed, freshly reset
            //   skukla/kukla-citisignal  401
            //   skukla/demo-builder-test 401  <- registered, nothing published
            //   adobe/helix-website      401
            const context = makeContext();

            const result = await checkGitHubAppForExistingRepo(context, outer404(), REPO_INFO);

            expect(result).toBeNull();
        });

        it('never shows the install dialog for it', async () => {
            const context = makeContext();

            await checkGitHubAppForExistingRepo(context, outer404(), REPO_INFO);

            expect(sentMessageTypes(context)).not.toContain(
                'storefront-setup-github-app-required',
            );
        });

        it('says so in the progress feed rather than passing in silence', async () => {
            const context = makeContext();

            await checkGitHubAppForExistingRepo(context, outer404(), REPO_INFO);

            // ALL progress messages, not the first: this function opens with
            // "Verifying GitHub App installation...", which sentPayload would
            // return and which would pass this assertion for the wrong reason.
            const messages = (context.sendMessage as unknown as jest.Mock).mock.calls
                .filter((c) => c[0] === 'storefront-setup-progress')
                .map((c) => String((c[1] as { message?: string }).message));
            expect(messages.join('\n')).toMatch(/no site for this repository yet/i);
        });

        it('does not blame the App in the log either', async () => {
            const context = makeContext();

            await checkGitHubAppForExistingRepo(context, outer404(), REPO_INFO);

            const logged = (context.logger as unknown as Record<string, jest.Mock>).info.mock.calls
                .map((c) => String(c[0]))
                .join('\n');
            expect(logged).toMatch(/no site for/i);
            expect(logged).not.toMatch(/AEM Code Sync is not installed/i);
        });

        it('does NOT retry a definitive answer', async () => {
            const context = makeContext();
            const services = makeServices({ isInstalled: false, codeStatus: 404 });

            await checkGitHubAppForExistingRepo(context, services, REPO_INFO);

            expect(services.githubAppService.isAppInstalled).toHaveBeenCalledTimes(1);
        });
    });

    describe('Helix refuses to answer (the field failure)', () => {
        it('retries once, then continues when the retry succeeds', async () => {
            const context = makeContext();
            const services = makeServices(
                { isInstalled: false, transient: true, httpStatus: 401 },
                { isInstalled: true, codeStatus: 200 }
            );

            const result = await checkGitHubAppForExistingRepo(context, services, REPO_INFO);

            expect(result).toBeNull();
            expect(services.githubAppService.isAppInstalled).toHaveBeenCalledTimes(2);
        });

        it('never claims the App is missing when the credential was rejected', async () => {
            const context = makeContext();
            const services = makeServices({ isInstalled: false, transient: true, httpStatus: 401 });

            const result = await checkGitHubAppForExistingRepo(context, services, REPO_INFO);

            // The whole point: a 401 says nothing about the App install.
            expect(result?.error).not.toBe('GitHub App installation required');
            expect(sentMessageTypes(context)).not.toContain('storefront-setup-github-app-required');
        });

        it('fails with a message naming the real problem and the HTTP status', async () => {
            const context = makeContext();
            const services = makeServices({ isInstalled: false, transient: true, httpStatus: 401 });

            const result = await checkGitHubAppForExistingRepo(context, services, REPO_INFO);

            expect(result?.success).toBe(false);
            expect(result?.error).toContain('verify');
            expect(result?.error).toContain('401');
        });

        // ─── Message quality (user-facing) ──────────────────────────────────
        //
        // This string is the whole remedy for the field failure. It is read by
        // a solution consultant mid-setup, not by us, and it has to end the
        // reinstall loop rather than feed it.

        it('names the actual control the user must click', async () => {
            const context = makeContext();
            const services = makeServices({ isInstalled: false, transient: true, httpStatus: 401 });

            const result = await checkGitHubAppForExistingRepo(context, services, REPO_INFO);

            // The link beside the GitHub account on the Storefront step reads
            // "Change" (GitHubServiceCard.tsx). Naming anything else sends the
            // user hunting for a control that does not exist.
            expect(result?.error).toContain('"Change"');
            expect(result?.error).toMatch(/storefront/i);
        });

        it('stays short enough to read at a glance', async () => {
            const context = makeContext();
            const services = makeServices({ isInstalled: false, transient: true, httpStatus: 401 });

            const result = await checkGitHubAppForExistingRepo(context, services, REPO_INFO);

            // Product constraint, not style preference: this renders in the
            // wizard's error area mid-setup. An earlier draft ran to ~345
            // characters of explanation and read as a paragraph. The cap leaves
            // room for long owner/repo names while blocking a return to prose.
            expect(result!.error!.length).toBeLessThan(260);
        });

        it('advises reconnecting rather than re-authorizing when AEM is unreachable', async () => {
            const context = makeContext();
            const services = makeServices({ isInstalled: false, transient: true });

            const result = await checkGitHubAppForExistingRepo(context, services, REPO_INFO);

            // No status means we never reached AEM, so nothing was rejected —
            // telling the user to re-authorize would send them at the wrong fix.
            expect(result?.error).toMatch(/connection/i);
            expect(result?.error).not.toMatch(/sign-in|"Change"/i);
        });

        it('tells the user that reinstalling the App will not help', async () => {
            const context = makeContext();
            const services = makeServices({ isInstalled: false, transient: true, httpStatus: 401 });

            const result = await checkGitHubAppForExistingRepo(context, services, REPO_INFO);

            // The original defect cost a user eleven reinstalls. Say so outright.
            expect(result?.error).toMatch(/reinstall/i);
        });

        it('uses no internal service jargon the user cannot act on', async () => {
            const context = makeContext();
            const services = makeServices({ isInstalled: false, transient: true, httpStatus: 401 });

            const result = await checkGitHubAppForExistingRepo(context, services, REPO_INFO);

            // "Helix" is our word for admin.hlx.page. It appears nowhere in the
            // product UI, so it cannot help a user and only reads as noise.
            expect(result?.error).not.toMatch(/helix/i);
            expect(result?.error).not.toMatch(/code\.status/i);
            expect(result?.error).not.toMatch(/transient|undetermined/i);
        });

        it('describes an unreachable service without inventing a status code', async () => {
            const context = makeContext();
            // Network failure: no HTTP status at all.
            const services = makeServices({ isInstalled: false, transient: true });

            const result = await checkGitHubAppForExistingRepo(context, services, REPO_INFO);

            expect(result?.error).not.toContain('undefined');
            expect(result?.error).not.toContain('n/a');
            expect(result?.error).toMatch(/could ?n[o']?t reach|no response/i);
        });

        it('logs the HTTP status and codeStatus so user logs are diagnosable', async () => {
            const context = makeContext();
            const services = makeServices({ isInstalled: false, transient: true, httpStatus: 401 });

            await checkGitHubAppForExistingRepo(context, services, REPO_INFO);

            const logged = (context.logger.info as jest.Mock).mock.calls
                .concat((context.logger.warn as jest.Mock).mock.calls)
                .map((c) => String(c[0]))
                .join('\n');
            expect(logged).toContain('401');
        });

        // ─── Message quality (debug log) ────────────────────────────────────
        //
        // Different audience, different rules: the Debug Logs channel is read by
        // us during triage, so precision beats plain language — but absent
        // fields must be omitted rather than padded with "n/a", which buries
        // the one value that matters.

        it("records Helix's own stated reason in the debug log", async () => {
            const context = makeContext();
            const services = makeServices({
                isInstalled: false,
                transient: true,
                httpStatus: 401,
                helixError: '[admin] not authenticated',
            });

            await checkGitHubAppForExistingRepo(context, services, REPO_INFO);

            const logged = (context.logger.warn as jest.Mock).mock.calls
                .map((c) => String(c[0]))
                .join('\n');
            expect(logged).toContain('[admin] not authenticated');
            expect(logged).toContain('admin.hlx.page');
        });

        it('omits absent fields instead of padding the log with "n/a"', async () => {
            const context = makeContext();
            const services = makeServices({ isInstalled: false, transient: true, httpStatus: 401 });

            await checkGitHubAppForExistingRepo(context, services, REPO_INFO);

            const logged = (context.logger.info as jest.Mock).mock.calls
                .concat((context.logger.warn as jest.Mock).mock.calls)
                .map((c) => String(c[0]))
                .join('\n');
            expect(logged).not.toContain('n/a');
            expect(logged).not.toContain('undefined');
        });

        it('treats a 5xx the same as a 401 — undeterminable, not uninstalled', async () => {
            const context = makeContext();
            const services = makeServices({ isInstalled: false, transient: true, httpStatus: 503 });

            const result = await checkGitHubAppForExistingRepo(context, services, REPO_INFO);

            expect(result?.error).not.toBe('GitHub App installation required');
            expect(sentMessageTypes(context)).not.toContain('storefront-setup-github-app-required');
        });
    });
});

/**
 * Missing GitHub credential.
 *
 * The gate asked the question with no token in hand and reported "App not
 * installed" — the same defect this file exists to prevent, one input short of
 * the 401 case. Signing out of GitHub should never produce an install prompt:
 * installing the App cannot supply a credential.
 */
describe('checkGitHubAppForExistingRepo — no GitHub credential', () => {
    beforeEach(() => jest.clearAllMocks());

    it('does not claim the App is missing when we hold no credential', async () => {
        const context = makeContext();
        const services = makeServices({ isInstalled: false, noCredential: true, transient: true });

        const result = await checkGitHubAppForExistingRepo(context, services, REPO_INFO);

        expect(result?.error).not.toBe('GitHub App installation required');
        expect(sentMessageTypes(context)).not.toContain('storefront-setup-github-app-required');
    });

    it('tells the user to sign in, not to check their connection', async () => {
        const context = makeContext();
        const services = makeServices({ isInstalled: false, noCredential: true, transient: true });

        const result = await checkGitHubAppForExistingRepo(context, services, REPO_INFO);

        expect(result?.error).toMatch(/sign(ed)? in/i);
        expect(result?.error).not.toMatch(/connection/i);
    });

    it('does not burn a retry waiting for a credential to appear', async () => {
        // A missing token is not transient in the retryable sense — waiting two
        // seconds cannot mint one.
        const context = makeContext();
        const services = makeServices({ isInstalled: false, noCredential: true, transient: true });

        await checkGitHubAppForExistingRepo(context, services, REPO_INFO);

        expect(services.githubAppService.isAppInstalled).toHaveBeenCalledTimes(1);
    });
});

/**
 * The install dialog must survive the pipeline halting.
 *
 * This gate sent `storefront-setup-github-app-required` — which renders
 * GitHubAppInstallDialog with the install URL and polls for the install — and
 * then returned `{ success: false, error: 'GitHub App installation required' }`.
 * The handler turned that into a thrown error and a `storefront-setup-error`
 * message, flipping the UI to the failure screen a moment after the dialog
 * appeared. The guided flow was built and wired, then destroyed on the way out,
 * and the resume handler downstream could never fire.
 *
 * A missing App is a halt with a remedy in progress, not a failure.
 */
describe('checkGitHubAppForExistingRepo — halting without failing', () => {
    beforeEach(() => jest.clearAllMocks());

    it('marks a missing App as awaiting installation, not as an error', async () => {
        const context = makeContext();
        const services = makeServices({ isInstalled: false, codeStatus: 404 });

        const result = await checkGitHubAppForExistingRepo(context, services, REPO_INFO);

        expect(sentMessageTypes(context)).toContain('storefront-setup-github-app-required');
        expect(result?.awaitingGitHubApp).toBe(true);
    });

    it('does NOT mark an undetermined check as awaiting installation', async () => {
        // No dialog can fix a refused credential, so that path must keep
        // failing loudly.
        const context = makeContext();
        const services = makeServices({ isInstalled: false, transient: true, httpStatus: 401 });

        const result = await checkGitHubAppForExistingRepo(context, services, REPO_INFO);

        expect(result?.awaitingGitHubApp).toBeFalsy();
    });
});
