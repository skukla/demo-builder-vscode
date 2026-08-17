/**
 * ACCS Discovery Service configuration.
 *
 * One place that knows how to read the `demoBuilder.accsDiscovery.services`
 * setting and pick the entry a given org should use. Both the wizard's
 * store-discovery handler and the headless `get_store_structure` reader select
 * a service the same way; keeping the rule here stops the two from drifting on
 * which entry wins or what counts as a usable URL.
 *
 * Callers own their own error messaging — this module reports WHY selection
 * failed and says nothing about how to tell the user.
 *
 * @module features/eds/services/accsDiscoveryConfig
 */

import * as vscode from 'vscode';
import { validateURL } from '@/core/validation';

/** ACCS Discovery Service entry from VS Code settings. */
export interface AccsDiscoveryService {
    orgName: string;
    orgId?: string;
    serviceUrl: string;
}

/** Every configured discovery service, in settings order. */
export function getDiscoveryServices(): AccsDiscoveryService[] {
    return vscode.workspace
        .getConfiguration('demoBuilder.accsDiscovery')
        .get<AccsDiscoveryService[]>('services', []);
}

/** Outcome of picking a discovery service — success carries the validated URL. */
export type DiscoveryServiceSelection =
    | { ok: true; serviceUrl: string }
    | { ok: false; reason: 'none-configured' | 'invalid-url' };

/**
 * Pick the discovery service for an org and validate its URL.
 *
 * Prefers the entry whose `orgId` matches; falls back to the first configured
 * service so a single-entry setup works without pinning an org (the wizard has
 * always behaved this way).
 *
 * @param orgId - IMS org to prefer, when known
 * @returns The validated service URL, or why no usable service was found
 */
export function selectDiscoveryService(orgId?: string): DiscoveryServiceSelection {
    const services = getDiscoveryServices();
    if (services.length === 0) {
        return { ok: false, reason: 'none-configured' };
    }

    const service = orgId ? (services.find((s) => s.orgId === orgId) ?? services[0]) : services[0];

    try {
        validateURL(service.serviceUrl, ['https']);
    } catch {
        return { ok: false, reason: 'invalid-url' };
    }

    return { ok: true, serviceUrl: service.serviceUrl };
}

/** The action a configured service URL points at. */
const DISCOVER_ACTION = 'discover-stores';

/** The sibling that dispenses the shared Commerce OAuth pair. */
const CREDENTIALS_ACTION = 'get-commerce-credentials';

/** Guard against a pathologically long setting value before parsing it. */
const MAX_SERVICE_URL_LENGTH = 2048;

/**
 * The credential endpoint that belongs to a configured discovery service.
 *
 * Both actions are siblings in the same App Builder package, so the only
 * difference is the last path segment — Adobe I/O Runtime routes on exactly that.
 *
 * Returns undefined for anything that is not recognisably a `discover-stores`
 * action URL. That refusal is the security-relevant half: without it a
 * mistyped or hostile `demoBuilder.accsDiscovery.services` entry would send the
 * user's IMS token to an arbitrary host and ask it for a Commerce credential.
 * `pdp404Snippet.deriveSiblingActionUrl` applies the same rule to the overlay
 * URL; the two are deliberately alike and deliberately separate, because they
 * key off different settings and neither should widen to accommodate the other.
 */
export function deriveCredentialServiceUrl(discoverStoresUrl: string): string | undefined {
    if (!discoverStoresUrl || discoverStoresUrl.length > MAX_SERVICE_URL_LENGTH) {
        return undefined;
    }

    let parsed: URL;
    try {
        parsed = new URL(discoverStoresUrl);
    } catch {
        return undefined;
    }

    const actionPattern = new RegExp(`/${DISCOVER_ACTION}/?$`);
    if (!actionPattern.test(parsed.pathname)) {
        return undefined;
    }

    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(actionPattern, `/${CREDENTIALS_ACTION}`);
    return parsed.toString();
}

/** Outcome of locating the credential endpoint for an org. */
export type CredentialServiceSelection =
    | { ok: true; serviceUrl: string }
    | { ok: false; reason: 'none-configured' | 'invalid-url' | 'not-derivable' };

/**
 * Where to ask for the shared Commerce credential, for a given org.
 *
 * Selection reuses {@link selectDiscoveryService} rather than repeating its rule
 * — including the fallback to the first entry, which is what serves a demo
 * project with no Adobe binding at all. Those projects are precisely the ones the
 * broker exists for, so the fallback is load-bearing here rather than incidental.
 *
 * `not-derivable` is its own reason on purpose: a service IS configured and we
 * still cannot build a credential request from it. That is a different thing for
 * the user to fix than having configured nothing.
 */
export function selectCredentialService(orgId?: string): CredentialServiceSelection {
    const selection = selectDiscoveryService(orgId);
    if (!selection.ok) {
        return selection;
    }

    const serviceUrl = deriveCredentialServiceUrl(selection.serviceUrl);
    return serviceUrl ? { ok: true, serviceUrl } : { ok: false, reason: 'not-derivable' };
}
