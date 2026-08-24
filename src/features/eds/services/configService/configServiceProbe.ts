/**
 * Configuration Service credential probe.
 *
 * Answers one question the logs could not: when the Configuration Service
 * refuses a write, is the credential bad, or is the credential fine and the
 * *identity* unauthorized?
 *
 * A colleague hit `PUT /config/{org}/sites/{site}.json -> 403` while the same
 * IMS token succeeded against `admin.da.live` seconds earlier. That combination
 * rules out expiry and malformation, but nothing surfaced it, so the case stayed
 * open for days while the obvious reading — "auth is broken" — pointed the wrong
 * way.
 *
 * `ConfigurationService.registerSite` names the mechanism in its own docstring:
 * the Configuration Service grants the admin role to whoever *installs* the AEM
 * Code Sync GitHub App. Someone who did not install it on that repo — a
 * teammate did, or an org admin installed it org-wide — holds a valid token and
 * is still refused every write.
 *
 * ## Read-only by construction
 *
 * Every leg is a GET, and a test enforces it. A diagnostic that PUT a site
 * config could clobber a live storefront. There is no safe write test worth
 * having: the only non-mutating one would be a PUT that 409s on an existing
 * config, which stops being safe the moment Adobe makes that endpoint an upsert.
 * Read access plus the user's observed write failure is enough to separate the
 * branches, and it cannot damage anything.
 *
 * Pattern: mirrors `probeGitHubCredential` — self-contained, returns structured
 * legs plus a one-line verdict, so Diagnostics renders rather than reasons.
 *
 * @module features/eds/services/configService/configServiceProbe
 */

import { readOrgAdmins } from './configServiceAccess';
import { DA_LIVE_BASE_URL } from '../daLive/daLiveConstants';
import { HELIX_ADMIN_URL } from '../helix/helixApiClient';
import { deriveRegisterKeyUrl } from '../pdp/pdp404Snippet';
import { maskEmail } from '@/core/utils/maskEmail';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { resolveByomOverlayUrl } from '@/features/eds/handlers/edsHelpers';
import type { Logger } from '@/types/logger';

// Host constant shared from helixApiClient — one definition (2026-08-22 spine sweep).
// Host constant shared from daLiveConstants — one definition (2026-08-22 spine sweep).

/** What each leg found. An absent leg means it never ran. */
export interface ConfigServiceProbeResult {
    token: { present: boolean; error?: string };
    /** GET of the site's Configuration Service entry. */
    configService?: {
        httpStatus?: number;
        /** Adobe's stated reason — the body is empty on 401/403. */
        xError?: string;
        /** Adobe support's trace handle for this exact call. */
        invocationId?: string;
        error?: string;
    };
    /**
     * The same credential against a different Adobe service. This is the leg
     * that makes a 403 interpretable: DA.live accepting what the Configuration
     * Service refuses is the signature of an authorization problem.
     */
    daLive?: { httpStatus?: number; error?: string };
    /**
     * Who holds the admin role on the org — the leg that turns "ask an admin"
     * into a name.
     *
     * Its own refusal is a finding, not a gap: a roster you cannot read means no
     * admin is visible to ask, which is what makes the Code Sync setup flow the
     * only remaining path (observed on `leahrayard`, 2026-08-14).
     */
    orgAdmins?: { status: 'ok' | 'not_authorized' | 'failed'; emails?: string[] };
    /**
     * Whether runtime PDP self-heal can work on this site.
     *
     * A site with any `access.admin` role closes the Helix admin API to
     * anonymous callers — and the smart-404 publisher that rescues an
     * unpublished PDP runs in the VISITOR's browser, which holds no credential.
     * It works only because the extension registers a publish key on the site
     * for the shared action to use.
     *
     * So `locked && keyCount === 0` means: every product added to the catalog
     * after setup will 404 on first visit. That failure is otherwise completely
     * silent — it surfaces as "some product pages don't work", days later, with
     * nothing connecting it to the admin grant that caused it. This leg exists
     * to make it visible on demand.
     */
    pdpPublishing?: {
        /** Site has an `access.admin` role, so the admin API needs credentials. */
        locked: boolean;
        /** Publish keys registered on the site. Undefined when unreadable. */
        keyCount?: number;
        /**
         * Whether the shared PDP action can actually READ a key for this site.
         *
         * `keyCount` above counts keys on the SITE; this asks the action whether
         * its own stored copy decrypts. The two disagree in exactly the cases
         * nothing else catches: a registration that never landed, and an
         * `ENCRYPTION_KEY` that no longer matches the one the blob was written
         * with. Absent when BYOM is off — there is no action to ask.
         */
        actionKey?: { registered?: boolean; error?: string };
        error?: string;
    };
    /** One-line interpretation of the legs together. */
    verdict: string;
}

/**
 * Minimal shape needed from the DA.live token provider.
 *
 * `null` is in the union because the real provider returns it — narrowing to
 * `undefined` here would compile only until a caller passed the actual service.
 */
interface TokenSource {
    getAccessToken(): Promise<string | null | undefined>;
}

interface ProbeResponse {
    ok: boolean;
    status: number;
    headers?: { get?: (name: string) => string | null };
}

/** GET with the IMS bearer. Never any other verb — see the module note. */
async function get(url: string, token: string): Promise<ProbeResponse> {
    return (await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
    })) as unknown as ProbeResponse;
}

function header(response: ProbeResponse, name: string): string | undefined {
    return response.headers?.get?.(name) ?? undefined;
}

/**
 * Interpret the legs together.
 *
 * Order matters: a 404 is checked before the permission branches because an
 * unregistered site is a different remedy entirely, and reading it as "refused"
 * would send someone chasing permissions they already have.
 */
function interpret(result: ConfigServiceProbeResult): string {
    const config = result.configService;
    const daLiveOk = result.daLive?.httpStatus === 200;

    if (config?.error) {
        return (
            `Could not reach the Configuration Service (${config.error}). ` +
            'Nothing can be concluded about permissions from this run.'
        );
    }

    const status = config?.httpStatus;

    if (status === 200) {
        return 'No problem found: this credential can read the site configuration.';
    }

    if (status === 404) {
        return (
            'No site config exists for this storefront yet — it is not registered. ' +
            'That is a missing registration, not a permission problem; a storefront ' +
            'reset registers it.'
        );
    }

    if (status === 403) {
        if (daLiveOk) {
            // Kept tight on purpose — a test caps the verdict at 400 chars so it
            // stays pasteable into a ticket.
            const base =
                'The credential is valid — DA.live accepted it in the same run — but the ' +
                'Configuration Service refused it. The admin role is minted for whoever ' +
                'installs AEM Code Sync, so an older site can refuse its own owner. ';

            // Naming a person beats naming a mechanism. Only possible when the
            // roster is readable — and when it is NOT, that absence is the more
            // useful finding, because it means there is nobody to ask.
            const emails = result.orgAdmins?.emails ?? [];
            if (result.orgAdmins?.status === 'ok' && emails.length > 0) {
                // Cap the list: a large org would blow the length budget and
                // bury the instruction under names.
                const named = emails.slice(0, 3).map(maskEmail).join(', ');
                const more = emails.length > 3 ? ` (+${emails.length - 3} more)` : '';
                return `${base}Ask an org admin to add you under Site users: ${named}${more}.`;
            }
            return (
                `${base}No org admin is visible either — open tools.aem.live/bot/setup for ` +
                'this site and add your email under Site users, then re-run this probe.'
            );
        }
        return (
            'The Configuration Service refused this credential, and DA.live did not accept ' +
            'it either. Sign in again, then re-run this probe — if it still refuses, the ' +
            'account lacks access to this org.'
        );
    }

    if (status === 401) {
        return (
            'The Configuration Service did not authenticate this credential. Sign in to ' +
            'DA.live again and re-run.'
        );
    }

    return (
        `The Configuration Service returned HTTP ${status ?? 'no response'}. ` +
        'Nothing decisive — include the invocation ID above when reporting this.'
    );
}

/**
 * Probe whether the current credential can reach a storefront's site config.
 *
 * Each leg fails into its own `error` field, so one unreachable host never costs
 * the answer the other would have given.
 *
 * @param tokenProvider - Supplies the DA.live/IMS access token
 * @param org - DA.live org (GitHub namespace)
 * @param site - Site name, matching the GitHub repo
 * @param logger - Receives non-secret breadcrumbs
 */
/**
 * Ask the shared PDP action whether it can read this site's publish key.
 *
 * A GET, like every other leg — the action's status endpoint reads and never
 * writes, so this does not weaken the read-only guarantee above.
 *
 * Returns `undefined` when BYOM is off or the overlay URL is not a shape we can
 * derive the status endpoint from: there is nothing to ask, which is not a fault.
 */
async function probeActionKey(
    org: string,
    site: string,
    token: string,
): Promise<{ registered?: boolean; error?: string } | undefined> {
    const overlayUrl = resolveByomOverlayUrl();
    if (!overlayUrl) return undefined;

    const registerUrl = deriveRegisterKeyUrl(overlayUrl);
    if (!registerUrl) return undefined;

    try {
        const url = `${registerUrl}?org=${encodeURIComponent(org)}&site=${encodeURIComponent(site)}`;
        const response = await get(url, token);
        if (!response.ok) return { error: `HTTP ${response.status}` };

        const body = (await (response as unknown as { json(): Promise<unknown> }).json()) as
            | { registered?: boolean }
            | undefined;
        return { registered: body?.registered === true };
    } catch (error) {
        return { error: (error as Error).message };
    }
}

export async function probeConfigService(
    tokenProvider: TokenSource,
    org: string,
    site: string,
    logger: Logger,
): Promise<ConfigServiceProbeResult> {
    const token = await tokenProvider.getAccessToken();
    if (!token) {
        return {
            token: { present: false },
            verdict: 'No DA.live credential stored — sign in to DA.live, then re-run this probe.',
        };
    }

    const result: ConfigServiceProbeResult = { token: { present: true }, verdict: '' };

    try {
        const response = await get(
            `${HELIX_ADMIN_URL}/config/${encodeURIComponent(org)}/sites/${encodeURIComponent(site)}.json`,
            token,
        );
        result.configService = {
            httpStatus: response.status,
            xError: header(response, 'x-error'),
            invocationId: header(response, 'x-invocation-id'),
        };
    } catch (error) {
        result.configService = { error: (error as Error).message };
    }

    // Comparison leg. Its only job is to say whether this credential is
    // accepted ANYWHERE, which is what turns a bare 403 into a diagnosis.
    try {
        const response = await get(
            `${DA_LIVE_BASE_URL}/source/${encodeURIComponent(org)}/${encodeURIComponent(site)}/index.html`,
            token,
        );
        result.daLive = { httpStatus: response.status };
    } catch (error) {
        result.daLive = { error: (error as Error).message };
    }

    // Roster leg. Delegates to `readOrgAdmins` rather than re-implementing the
    // same endpoint, filter and status mapping — both were added in the same
    // batch, so a second copy would be duplication created, not inherited.
    // Best-effort and never fatal: it only ADDS names to a verdict the other
    // legs already produce, so a failure here must not cost the report its
    // diagnosis.
    try {
        // Hand it the token this probe already fetched: satisfies the access
        // module's narrower TokenProvider and avoids a second keychain read.
        const roster = await readOrgAdmins({ getAccessToken: async () => token }, org, logger);
        result.orgAdmins =
            roster.status === 'ok'
                ? { status: 'ok', emails: roster.admins ?? [] }
                : { status: roster.status === 'not_authorized' ? 'not_authorized' : 'failed' };
    } catch {
        result.orgAdmins = { status: 'failed' };
    }

    // Runtime-PDP leg. Two cheap reads that together answer "can a product
    // added after setup publish itself on first visit?" — the question this
    // whole feature turns on, and the one nothing else in the report asks.
    try {
        const access = await get(
            `${HELIX_ADMIN_URL}/config/${encodeURIComponent(org)}/sites/${encodeURIComponent(site)}/access/admin.json`,
            token,
        );
        // 404 means no grants yet, which is "not locked" — NOT an error.
        const locked = access.status === 200;

        let keyCount: number | undefined;
        const keys = await get(
            `${HELIX_ADMIN_URL}/config/${encodeURIComponent(org)}/sites/${encodeURIComponent(site)}/apiKeys.json`,
            token,
        );
        if (keys.status === 200) {
            const body = (await (keys as unknown as { json(): Promise<unknown> }).json()) as
                | Record<string, unknown>
                | undefined;
            keyCount = Object.keys(body ?? {}).length;
        } else if (keys.status === 404) {
            keyCount = 0; // same convention as the access doc: absent = none
        }

        result.pdpPublishing = {
            locked,
            keyCount,
            actionKey: await probeActionKey(org, site, token),
        };
    } catch (error) {
        result.pdpPublishing = { locked: false, error: (error as Error).message };
    }

    result.verdict = interpret(result);
    logger.debug(
        `[ConfigProbe] ${org}/${site}: config=${result.configService?.httpStatus ?? 'err'}, ` +
            `da.live=${result.daLive?.httpStatus ?? 'err'}, ` +
            `orgAdmins=${result.orgAdmins?.emails?.length ?? result.orgAdmins?.status}`,
    );
    return result;
}
