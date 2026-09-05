/**
 * Shared harness for the `configServiceProbe` suite family.
 *
 * The probe makes up to six GETs against three hosts, and the interesting cases
 * are the ones where those legs DISAGREE — a config read that 403s while DA.live
 * answers 200 is the whole reason the module exists. A stub keyed on host cannot
 * express that, so `routedFetch` routes by the endpoint each leg calls and every
 * leg carries its own reply.
 *
 * The `jest.mock` for `edsHelpers` and the subject import live here together: a
 * mock only hoists above the imports of the module it appears in, so a spec that
 * imported the probe directly would get the real `resolveByomOverlayUrl` and turn
 * the BYOM leg on from the user's own settings.
 *
 * @see tests/sop/test-family-setup.test.ts
 */

// BYOM is a user setting, so the action leg is off unless a test turns it on.
// Only `resolveByomOverlayUrl` is imported from this module by the probe.
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    resolveByomOverlayUrl: jest.fn(() => undefined),
}));

import { createMockLogger } from '../../../../helpers/loggerFake';
import { resolveByomOverlayUrl } from '@/features/eds/handlers/edsHelpers';

export { probeConfigService } from '@/features/eds/services/configService/configServiceProbe';
export type { ConfigServiceProbeResult } from '@/features/eds/services/configService/configServiceProbe';

export const mockResolveOverlayUrl = resolveByomOverlayUrl as jest.MockedFunction<
    typeof resolveByomOverlayUrl
>;

export const logger = createMockLogger();
export const TOKEN = 'ims-token-value-never-logged';
export const ORG = 'skukla';
export const SITE = 'b2b-tester';

export function tokenProvider() {
    return { getAccessToken: jest.fn().mockResolvedValue(TOKEN) };
}

/**
 * The no-credential case needs its own factory. Passing `undefined` to a
 * defaulted parameter triggers the default, so `tokenProvider(undefined)`
 * quietly handed back a valid token and the test asserted nothing.
 */
export function tokenProviderWithNoCredential() {
    return { getAccessToken: jest.fn().mockResolvedValue(undefined) };
}

/** Build a fetch stub keyed on which host the probe is calling. */
export function fetchStub(
    byHost: Record<string, { status: number; headers?: Record<string, string> }>,
) {
    return jest.fn().mockImplementation((url: string) => {
        const key = Object.keys(byHost).find((k) => url.includes(k));
        if (!key) return Promise.reject(new Error(`unstubbed host: ${url}`));
        const { status, headers = {} } = byHost[key];
        return Promise.resolve({
            ok: status >= 200 && status < 300,
            status,
            headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
        });
    });
}

/** What one leg answers. `reject` wins over everything else. */
export interface LegReply {
    status?: number;
    /** Header values, keyed lowercase, as the service would send them. */
    headers?: Record<string, string>;
    /** What `json()` resolves to. */
    body?: unknown;
    /** Reject the fetch outright with this message. */
    reject?: string;
    /** Answer with no `headers` object at all, as a bare stub would. */
    noHeaders?: boolean;
    /** Answer with a `headers` object that has no `get`. */
    headersWithoutGet?: boolean;
}

/** One reply per leg the probe makes. Omitted legs take the healthy default. */
export interface ProbeLegs {
    /** GET /config/{org}/sites/{site}.json */
    config?: LegReply;
    /** GET admin.da.live/source/{org}/{site}/index.html */
    daLive?: LegReply;
    /** GET /config/{org}.json — the org roster */
    roster?: LegReply;
    /** GET /config/{org}/sites/{site}/access/admin.json */
    access?: LegReply;
    /** GET /config/{org}/sites/{site}/apiKeys.json */
    apiKeys?: LegReply;
    /** GET the shared PDP action's register-publish-key endpoint */
    action?: LegReply;
}

const DEFAULTS: Required<Pick<ProbeLegs, 'config' | 'daLive' | 'roster' | 'access' | 'apiKeys'>> = {
    config: { status: 200 },
    daLive: { status: 200 },
    roster: { status: 200, body: { users: [] } },
    access: { status: 404 },
    apiKeys: { status: 404 },
};

/**
 * A fetch stub that answers each leg separately.
 *
 * Matched most specific first: the access and apiKeys docs live UNDER the site
 * path the config read uses, so a substring test in the other order would send
 * both to the config reply.
 */
export function routedFetch(legs: ProbeLegs = {}) {
    const pick = (url: string): LegReply | undefined => {
        if (url.includes('register-publish-key')) return legs.action;
        if (url.includes('/access/admin.json')) return legs.access ?? DEFAULTS.access;
        if (url.includes('/apiKeys.json')) return legs.apiKeys ?? DEFAULTS.apiKeys;
        if (url.includes('admin.da.live')) return legs.daLive ?? DEFAULTS.daLive;
        if (url.includes(`/config/${ORG}.json`)) return legs.roster ?? DEFAULTS.roster;
        return legs.config ?? DEFAULTS.config;
    };

    return jest.fn().mockImplementation((url: string) => {
        const leg = pick(String(url));
        if (!leg) return Promise.reject(new Error(`unrouted: ${url}`));
        if (leg.reject) return Promise.reject(new Error(leg.reject));
        const status = leg.status ?? 200;
        const headers = leg.noHeaders
            ? undefined
            : leg.headersWithoutGet
              ? {}
              : { get: (n: string) => leg.headers?.[n.toLowerCase()] ?? null };
        return Promise.resolve({
            ok: status >= 200 && status < 300,
            status,
            headers,
            json: async () => leg.body,
        });
    });
}

/** Build an org roster body granting the admin role to each address. */
export function rosterOf(...emails: string[]): { users: Array<{ email: string; roles: string[] }> } {
    return { users: emails.map((email) => ({ email, roles: ['admin'] })) };
}

/**
 * The verdict prefix every 403-with-a-valid-credential case shares.
 *
 * Written out so the tests assert the WHOLE verdict rather than a fragment of
 * it — a `toMatch(/install/)` passes for four different verdicts.
 */
export const CREDENTIAL_VALID_BASE =
    'The credential is valid — DA.live accepted it in the same run — but the ' +
    'Configuration Service refused it. The admin role is minted for whoever ' +
    'installs AEM Code Sync, so an older site can refuse its own owner. ';
