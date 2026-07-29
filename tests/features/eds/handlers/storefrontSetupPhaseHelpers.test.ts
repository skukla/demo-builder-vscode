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

import { checkGitHubAppForExistingRepo } from '@/features/eds/handlers/storefrontSetupPhaseHelpers';
import type { RepoInfo, SetupServices } from '@/features/eds/handlers/storefrontSetupTypes';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';

jest.setTimeout(15000);

const REPO_INFO: RepoInfo = {
    repoOwner: 'sayurihanki',
    repoName: 'herberaircraftv3',
    repoUrl: 'https://github.com/sayurihanki/herberaircraftv3',
};

const INSTALL_URL = 'https://github.com/apps/aem-code-sync/installations/select_target';

function makeContext(): HandlerContext {
    return {
        logger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            trace: jest.fn(),
        } as unknown as Logger,
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

        it('prompts to install when the status endpoint returns HTTP 404', async () => {
            const context = makeContext();
            const services = makeServices({
                isInstalled: false,
                httpNotFound: true,
                httpStatus: 404,
            });

            const result = await checkGitHubAppForExistingRepo(context, services, REPO_INFO);

            expect(result?.error).toBe('GitHub App installation required');
            expect(sentMessageTypes(context)).toContain('storefront-setup-github-app-required');
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
