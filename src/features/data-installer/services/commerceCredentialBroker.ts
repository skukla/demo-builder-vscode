/**
 * Ask the shared discovery service for the Commerce OAuth pair.
 *
 * A datapack write authenticates with an OAuth Server-to-Server pair, and one can
 * only be created inside an Adobe I/O project workspace. A demo project that
 * selected no App Builder components never gets a workspace, so before this
 * existed it could browse the catalog and never import. The pair lives in the
 * shared service instead — in the org where the Commerce instances are — and is
 * handed out to callers that clear its IMS + email-domain guard.
 *
 * **This never throws, and never blocks for long.** It runs in front of a modal
 * (`edsResetUI.confirmSampleDataRemoval`) and inside project creation
 * (`sampleDataInstallDeps`), so every failure — no session, 403, timeout, a
 * gateway HTML page where JSON was expected — comes back as `undefined`, meaning
 * "no credential from here". The caller then reports the same missing-credential
 * gap it always did.
 *
 * **The pair is returned and nothing else.** It is not cached to disk, not written
 * to `componentConfigs`, and not put in SecretStorage: it is shared rather than
 * per-project, and one org-wide write credential copied into N project state files
 * is the outcome this whole design exists to avoid. It is also cheap to re-fetch,
 * which a stale persisted copy would not be after a rotation.
 *
 * @module features/data-installer/services/commerceCredentialBroker
 */

import type { BrokerOutcome, CredentialBroker } from './commerceCredentials';
import { createCacheEntry, isExpired, type CacheEntry } from '@/core/cache';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { selectCredentialService } from '@/features/eds/services/accsDiscoveryConfig';
import type { HandlerContext } from '@/types/handlers';

/**
 * How long a fetched pair is reused, keyed by the service that served it.
 *
 * MEASURED, not guessed: one dry run on a real project resolved credentials
 * twice, eight seconds apart, so the endpoint saw two GETs for one user action.
 * The cache was deliberately left out until there was a number.
 *
 * Bounded rather than session-long because the shared pair CAN be rotated in the
 * service, and a copy that outlives the window would keep failing with nothing
 * to say why — the user's only recourse being a window reload they have no
 * reason to try. Thirty minutes collapses every burst within a working session
 * while keeping the stale window shorter than the time it takes to notice.
 */
const CREDENTIAL_CACHE_TTL_MS = 30 * 60 * 1000;

/** Keyed by resolved service URL — two configured services are two credentials. */
const credentialCache = new Map<string, CacheEntry<SharedCommerceCredentials>>();

/**
 * Drop every cached pair.
 *
 * NOT a test-only export. The cached pair was fetched under ONE user's
 * authorization — the service validates their IMS token and checks their email
 * domain — so if they sign out, a later user must not inherit a credential they
 * were never cleared for. Sign-out calls this.
 */
export function clearSharedCredentialCache(): void {
    credentialCache.clear();
}

/** The pair, exactly as the ACCS credential shape elsewhere in this feature. */
export interface SharedCommerceCredentials {
    clientId: string;
    clientSecret: string;
}

export interface BrokerDeps {
    /** The `get-commerce-credentials` endpoint, from `selectCredentialService`. */
    serviceUrl: string;
    /** The user's Adobe IMS token — what the service authenticates. */
    getToken: () => Promise<string | undefined>;
    /** Injected so the whole path is testable without a network. */
    fetchImpl?: typeof fetch;
    /** Status lines only. The pair and the token must never reach this. */
    log?: (line: string) => void;
}

/** The service's envelope, only as deep as this reads. */
interface CredentialResponse {
    success?: boolean;
    data?: { clientId?: string; clientSecret?: string };
    error?: string;
}

/**
 * The shared pair, or undefined when this project cannot have one.
 *
 * Undefined is a verdict rather than an error: it means "not from here", and the
 * caller already has a path for that.
 */
export async function fetchSharedCommerceCredentials(
    deps: BrokerDeps,
): Promise<SharedCommerceCredentials | undefined> {
    const { serviceUrl, getToken, fetchImpl = fetch, log } = deps;

    try {
        const token = await getToken();
        if (!token) {
            log?.('shared credential: no Adobe session, not asking');
            return undefined;
        }

        const response = await fetchImpl(serviceUrl, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
            // QUICK, not NORMAL: this sits in front of a modal, and a credential
            // lookup that takes half a minute to say "no" is worse than one that
            // says "no" straight away.
            signal: AbortSignal.timeout(TIMEOUTS.QUICK),
        });

        const raw = await response.text();
        const body = safeParse(raw);

        if (!response.ok) {
            // The status is the diagnosable part — 403 means the caller's email
            // domain is not allowlisted, 503 means the service is missing its
            // own configuration, and those need different people to fix them.
            // Neither the user nor we can tell them apart from "no credential".
            log?.(`shared credential: ${response.status}${describe(body) ? ` — ${describe(body)}` : ''}`);
            return undefined;
        }

        const pair = readPair(body);
        if (!pair) {
            log?.('shared credential: the service answered without a usable pair');
            return undefined;
        }

        log?.('shared credential: obtained from the discovery service');
        return pair;
    } catch (error) {
        // Structural, not message-matched: AbortSignal.timeout throws AbortError,
        // and Node's fetch reports network failure as TypeError('fetch failed').
        // Either way the answer is the same, and neither is worth a stack trace
        // in a channel a user pastes into a ticket.
        const name = error instanceof Error ? error.name : 'unknown';
        log?.(`shared credential: request failed (${name})`);
        return undefined;
    }
}

/** Both halves or nothing — the rule `resolveCommerceCredentials` already holds. */
function readPair(body: CredentialResponse | undefined): SharedCommerceCredentials | undefined {
    if (body?.success !== true) {
        return undefined;
    }
    const clientId = body.data?.clientId;
    const clientSecret = body.data?.clientSecret;
    return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

/** The auth surface this needs — narrowed to what `AuthenticationService` provides. */
export interface BrokerAuth {
    getTokenManager: () => { inspectToken: () => Promise<{ token?: string }> };
}

export interface ProjectBrokerDeps {
    /** Absent when the user has no Adobe session wired up at this call site. */
    auth?: BrokerAuth;
    /** The project's Adobe org, when it has one. Selection falls back without it. */
    orgId?: string;
    /** Status lines only — no pair, no token. */
    log?: (line: string) => void;
    fetchImpl?: typeof fetch;
}

/**
 * The broker for one project, ready to hand to `resolveCommerceCredentials`.
 *
 * This is where the two halves meet: which service to ask (a settings question)
 * and how to ask it (an HTTP question). Both callers with a `HandlerContext` and
 * the two without build it the same way, so the rule for "is a shared credential
 * available here?" has exactly one implementation.
 *
 * **The two failure reasons are decided here, and they are not the same problem.**
 * A settings failure — nothing configured, a non-https entry, a URL that is not a
 * `discover-stores` action — is `not-configured`, which the user can fix and which
 * is otherwise invisible: riding on `demoBuilder.accsDiscovery.services` means
 * someone who never set up store discovery would get silence. Everything else —
 * no Adobe session, 403, 503, a timeout — is `unavailable`, where the remedy is
 * the same one that existed before this feature: supply a pair.
 */
export function createProjectCredentialBroker(deps: ProjectBrokerDeps): CredentialBroker {
    return async (): Promise<BrokerOutcome> => {
        const selection = selectCredentialService(deps.orgId);
        if (!selection.ok) {
            deps.log?.(`shared credential: no usable service configured (${selection.reason})`);
            return { ok: false, reason: 'not-configured' };
        }

        if (!deps.auth) {
            deps.log?.('shared credential: no authentication service available here');
            return { ok: false, reason: 'unavailable' };
        }

        // One user action resolves credentials more than once — a dry run does it
        // twice — and each miss is a network round trip in front of a modal.
        const cached = credentialCache.get(selection.serviceUrl);
        if (cached && !isExpired(cached)) {
            deps.log?.('shared credential: reusing the one already fetched this session');
            return { ok: true, credentials: cached.value };
        }

        const credentials = await fetchSharedCommerceCredentials({
            serviceUrl: selection.serviceUrl,
            getToken: async () => (await deps.auth?.getTokenManager().inspectToken())?.token,
            ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
            ...(deps.log ? { log: deps.log } : {}),
        });

        if (!credentials) {
            // Refusals are never cached. A 403 that gets fixed by an allowlist
            // change, or a timeout during an outage, must be retryable on the
            // next attempt rather than sticky for the rest of the window.
            return { ok: false, reason: 'unavailable' };
        }

        credentialCache.set(
            selection.serviceUrl,
            createCacheEntry(credentials, CREDENTIAL_CACHE_TTL_MS),
        );
        return { ok: true, credentials };
    };
}

/**
 * The broker for a project, built from a handler context.
 *
 * Four of the five credential call sites have a `HandlerContext` and would
 * otherwise assemble these three arguments identically; the fifth
 * (`edsResetUI.confirmSampleDataRemoval`) has no context and calls
 * {@link createProjectCredentialBroker} directly with a `ServiceLocator` auth
 * service. Extracted at the fourth caller rather than the second, and it exists
 * so the org argument in particular cannot drift between surfaces — a project
 * resolving its credential from a different service depending on which screen
 * asked would be invisible until it wrote to the wrong instance.
 */
export function brokerForContext(
    context: HandlerContext,
    project: { adobe?: { organization?: string } },
): CredentialBroker {
    return createProjectCredentialBroker({
        ...(context.authManager ? { auth: context.authManager } : {}),
        ...(project.adobe?.organization ? { orgId: project.adobe.organization } : {}),
        log: (line) => context.debugLogger.debug(`[Data Installer] ${line}`),
    });
}

/** A gateway can answer 200 with an HTML error page; that is not a pair. */
function safeParse(raw: string): CredentialResponse | undefined {
    try {
        return JSON.parse(raw) as CredentialResponse;
    } catch {
        return undefined;
    }
}

/** The service's own error text, when it sent one. */
function describe(body: CredentialResponse | undefined): string | undefined {
    return typeof body?.error === 'string' ? body.error : undefined;
}
