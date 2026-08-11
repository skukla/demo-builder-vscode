/**
 * apiAccessRows — fetch the org's Adobe API catalog and shape it for a picker.
 *
 * The one place the two console-API handlers share. Both the wizard's
 * `list-org-console-apis` (pre-project) and the dashboard's `listConsoleApis`
 * (live project) do exactly this: build a subscriber client, pull the org's
 * entitled-services catalog, and reduce it to picker rows. What legitimately
 * differs between them is the CONTEXT around this call — where the org id comes
 * from, which guards run, and which codes count as locked — so those stay in the
 * handlers and only the shared middle lives here.
 *
 * Keeping it in one place matters because this call has bitten us twice in a
 * day: its 60s budget and its error-vs-empty behaviour were both fixed on one
 * path first (2026-07-31). Two copies means one gets the next fix.
 *
 * Placed in app-builder rather than beside `buildApiAccessCatalog` in
 * authentication: that module is pure (types only), and adding a fetch would
 * point authentication at app-builder. The dependency already runs this way —
 * `apiSubscriberClientAdapter` imports `AuthenticationService`.
 *
 * @module features/app-builder/services/apiAccessRows
 */

import { createApiSubscriberClient } from './apiSubscriberClientAdapter';
import {
    buildApiAccessCatalog,
    type ApiCatalogRow,
} from '@/features/authentication/services/apiAccessCatalog';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';

/**
 * The org's subscribable Adobe services, deduped and entitlement-filtered.
 *
 * Throws rather than returning `[]` on failure — an empty catalog is
 * indistinguishable from "this org entitles nothing", and callers turn a throw
 * into a typed error their pickers can offer a Retry for.
 *
 * @param authService - supplies the subscriber client
 * @param orgId - the Adobe org whose catalog to read
 * @param keep - codes that must survive the noise filter (the locked/managed set)
 * @returns picker-ready rows in first-seen order
 */
export async function fetchApiAccessRows(
    authService: AuthenticationService,
    orgId: string,
    keep: Set<string>,
): Promise<ApiCatalogRow[]> {
    const client = createApiSubscriberClient(authService);
    const services = await client.getServicesForOrg(orgId);
    // Clean the raw catalog (dedupe, drop deprecated/unsupported noise, classify
    // review/profile gating, carry product families); `keep` codes always survive.
    return buildApiAccessCatalog(services, keep);
}
