/**
 * GitHub ↔ AEM Credential Probe
 *
 * Asks three questions in one pass and interprets them together:
 *
 *   1. Who are we signed in as, and with which scopes did GitHub actually
 *      grant?                                    GET api.github.com/user
 *   2. Does GitHub agree that user can write to the repo?
 *                                                GET /repos/{owner}/{repo}
 *   3. What does AEM say when handed the same credential?
 *                                                GET admin.hlx.page/status/...
 *
 * No single answer settles anything. The combination does — above all
 * `permissions.push: true` alongside an AEM 401, which rules out scope and
 * permission problems and leaves the credential itself as the cause. That is
 * exactly the branch that could not be distinguished during the 2026-07-24
 * field failure, where a user was repeatedly told to install a GitHub App that
 * was already installed and syncing her repo.
 *
 * Pattern: mirrors `probeInExtensionMcpTools` — a self-contained probe the
 * Diagnostics command calls and renders, so the logic stays testable outside
 * the VS Code command shell.
 *
 * @module features/eds/services/github/githubCredentialProbe
 */

import { HELIX_ADMIN_URL } from '../helix/helixApiClient';
import { describeTokenType } from './githubAppService';
import type { GitHubTokenService } from './githubTokenService';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

const GITHUB_API_BASE_URL = 'https://api.github.com';
// Host constant shared from helixApiClient — one definition (2026-08-22 spine sweep).

/** What each leg of the probe found. Absent legs mean "not run". */
export interface CredentialProbeResult {
    github: {
        reachable: boolean;
        login?: string;
        /** Scopes GitHub GRANTED (x-oauth-scopes) — not the set we requested. */
        grantedScopes?: string[];
        /** Credential type prefix only (gho_, ghu_, ghp_, github_pat_). Never the value. */
        tokenType?: string;
        error?: string;
    };
    repo?: { fullName: string; canPush?: boolean; error?: string };
    adminApi?: { httpStatus?: number; xError?: string; codeStatus?: number; error?: string };
    /** One-line interpretation of all three legs together. */
    verdict: string;
}

/** Parse the `x-oauth-scopes` header into the granted scope list. */
function parseGrantedScopes(header: string | null): string[] | undefined {
    if (!header) return undefined;
    const scopes = header
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    return scopes.length > 0 ? scopes : undefined;
}

/** Read a header defensively — mocked and partial responses may lack `headers`. */
function header(response: { headers?: { get?: (n: string) => string | null } }, name: string) {
    return response.headers?.get?.(name) ?? null;
}

async function githubRequest(url: string, token: string): Promise<Response> {
    return fetch(url, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
        },
        signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
    });
}

/**
 * Run the three-way credential probe.
 *
 * Every leg fails independently into its own `error` field, so one unreachable
 * host never costs the answers the other two would have given.
 *
 * @param tokenService - Supplies the stored GitHub credential
 * @param repoFullName - `owner/repo`, or undefined when no EDS project is open
 * @param logger - Receives non-secret breadcrumbs
 */
export async function probeGitHubCredential(
    tokenService: Pick<GitHubTokenService, 'getToken'>,
    repoFullName: string | undefined,
    logger: Logger,
): Promise<CredentialProbeResult> {
    const stored = await tokenService.getToken();
    if (!stored) {
        return {
            github: { reachable: false },
            verdict:
                'Not signed in to GitHub. Sign in on the Storefront step, then run diagnostics again.',
        };
    }

    const token = stored.token;
    const tokenType = describeTokenType(token);
    logger.debug(`[Credential Probe] Probing with a ${tokenType} credential`);

    // ── Leg 1: identity and granted scopes ──────────────────────────────────
    const github: CredentialProbeResult['github'] = { reachable: false, tokenType };
    try {
        const response = await githubRequest(`${GITHUB_API_BASE_URL}/user`, token);
        if (!response.ok) {
            github.error = `HTTP ${response.status}`;
            return {
                github,
                verdict:
                    `GitHub rejected the stored credential (HTTP ${response.status}). ` +
                    `Sign in again from the Storefront step.`,
            };
        }
        const body = (await response.json()) as { login?: string };
        github.reachable = true;
        github.login = body?.login;
        github.grantedScopes = parseGrantedScopes(header(response, 'x-oauth-scopes'));
    } catch (error) {
        github.error = (error as Error).message;
        return {
            github,
            verdict: `Couldn't reach GitHub (${github.error}). Check your connection and run diagnostics again.`,
        };
    }

    if (!repoFullName) {
        return {
            github,
            verdict:
                `Signed in as ${github.login ?? 'unknown'}. No EDS project repo to check — ` +
                `open a project and run diagnostics again to test repo and AEM access.`,
        };
    }

    // ── Leg 2: does GitHub grant write access? ──────────────────────────────
    const repo: NonNullable<CredentialProbeResult['repo']> = { fullName: repoFullName };
    try {
        const response = await githubRequest(`${GITHUB_API_BASE_URL}/repos/${repoFullName}`, token);
        if (!response.ok) {
            repo.error = `HTTP ${response.status}`;
        } else {
            const body = (await response.json()) as { permissions?: { push?: boolean } };
            repo.canPush = body?.permissions?.push;
        }
    } catch (error) {
        repo.error = (error as Error).message;
    }

    // ── Leg 3: does AEM accept the same credential? ─────────────────────────
    const adminApi: NonNullable<CredentialProbeResult['adminApi']> = {};
    try {
        const response = await fetch(
            `${HELIX_ADMIN_URL}/status/${repoFullName}/main?editUrl=auto`,
            {
                method: 'GET',
                headers: { 'x-auth-token': token },
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            },
        );
        adminApi.httpStatus = response.status;
        adminApi.xError = header(response, 'x-error') ?? undefined;
        if (response.ok) {
            const body = (await response.json()) as { code?: { status?: number } };
            adminApi.codeStatus = body?.code?.status;
        }
    } catch (error) {
        adminApi.error = (error as Error).message;
    }

    return { github, repo, adminApi, verdict: interpret(github, repo, adminApi) };
}

/**
 * Turn three independent answers into one conclusion.
 *
 * Order matters: a definite "GitHub says you cannot write here" explains an AEM
 * rejection, so it must be reported ahead of the rejection it causes.
 */
function interpret(
    github: CredentialProbeResult['github'],
    repo: NonNullable<CredentialProbeResult['repo']>,
    adminApi: NonNullable<CredentialProbeResult['adminApi']>,
): string {
    const who = github.login ?? 'unknown';

    if (repo.canPush === false) {
        return (
            `Signed in as ${who}, who does not have write access to ${repo.fullName}. ` +
            `AEM verifies write access, so this alone explains the failure.`
        );
    }

    if (adminApi.httpStatus === 404) {
        return `AEM does not know ${repo.fullName} — AEM Code Sync is most likely not installed on it.`;
    }

    if (adminApi.error !== undefined) {
        return `Couldn't reach AEM (${adminApi.error}). GitHub access looks fine; retry when back online.`;
    }

    // 401 gets its own reading. Storefront setup pins a site admin, which makes
    // the Configuration Service set `requireAuth: "auto"` and closes the admin
    // API to everything but the DA.live bearer — so a GitHub token being
    // refused is the EXPECTED state on a current storefront, not a broken
    // credential. The old wording ("AEM is refusing the credential itself") was
    // written before pinning existed and now sends people chasing a credential
    // problem that is not there. The same report says `admin-locked` in its
    // Configuration Service section; this line must not contradict it.
    if (adminApi.httpStatus === 401 && repo.canPush === true) {
        return (
            `GitHub accepts this credential and reports write access to ${repo.fullName}, ` +
            `but AEM returned 401${adminApi.xError ? ` (${adminApi.xError})` : ''}. ` +
            `On a storefront with site-access admins configured this is EXPECTED — the admin ` +
            `API then requires the DA.live session, not a GitHub token. Check the ` +
            `Configuration Service section below: if it reports admin-locked, nothing is wrong ` +
            `with this credential. If it does not, the credential itself is being refused.`
        );
    }

    if (adminApi.httpStatus !== undefined && adminApi.httpStatus !== 200) {
        if (repo.canPush === true) {
            return (
                `GitHub accepts this credential and reports write access to ${repo.fullName}, ` +
                `but AEM rejected it (HTTP ${adminApi.httpStatus}` +
                `${adminApi.xError ? `, ${adminApi.xError}` : ''}). ` +
                `Not a scope or permission problem — AEM is refusing the credential itself.`
            );
        }
        return (
            `AEM rejected the credential (HTTP ${adminApi.httpStatus}) and GitHub did not confirm ` +
            `write access to ${repo.fullName}. Check repo access first.`
        );
    }

    return (
        `Credential is healthy — GitHub and AEM both accept it ` +
        `(code.status ${adminApi.codeStatus ?? 'unknown'}). A code-sync check should succeed.`
    );
}
