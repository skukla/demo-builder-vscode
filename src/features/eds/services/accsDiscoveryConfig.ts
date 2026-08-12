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
