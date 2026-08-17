/**
 * `check-credential-service` — will the shared service hand this user a Commerce
 * credential?
 *
 * The probe behind it has existed since the Data Installer work and was wired into
 * ONE place: the Diagnostics report. That is the wrong place for it. Its own
 * docstring names the failure it was written for — *"A user one allowlist entry
 * away from a working import currently gets told to go and find a credential in
 * the Developer Console"* — and the surface that tells them exactly that is the
 * wizard's Connection step, which never asked.
 *
 * So this is a handler, not new logic: it exposes `probeCredentialService` to the
 * webview so the two OAuth fields can say whether they need filling in at all.
 *
 * **It answers the STATUS and never the credential.** `probeCredentialService`
 * deliberately never reads the response body, because the body is a live pair that
 * can write catalog data to every ACCS instance in its org. Nothing here weakens
 * that: a boolean and a sentence cross the webview boundary, never a secret.
 *
 * @module features/eds/handlers/credentialServiceHandler
 */

import { probeCredentialService } from '@/features/data-installer/services/credentialServiceProbe';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/** What the wizard needs to decide how to render the credential fields. */
export interface CredentialServiceStatus {
    /** True when the service answered 200 — the import will get a pair. */
    served: boolean;
    /** One line naming the state, and the remedy where there is one. */
    verdict: string;
    /** Present when a request was actually made. Drives the "who fixes it" copy. */
    httpStatus?: number;
}

interface CheckCredentialServicePayload {
    /** The org whose service entry to select. Falls back to the current project's. */
    orgId?: string;
}

/**
 * Probe the shared credential service for this org.
 *
 * Never fails the caller: an unreachable service, a missing setting and a 403 are
 * all legitimate answers the UI renders differently, and none of them is an error
 * the user can act on by retrying. The verdict carries the distinction.
 */
export async function handleCheckCredentialService(
    context: HandlerContext,
    payload: CheckCredentialServicePayload = {},
): Promise<HandlerResponse> {
    const orgId = payload.orgId ?? (await context.stateManager?.getCurrentProject())?.adobe?.organization;

    const result = await probeCredentialService({
        ...(context.authManager ? { auth: context.authManager } : {}),
        ...(orgId ? { orgId } : {}),
    });

    // 200 is the only state that means "you need type nothing here". Every other
    // state — unconfigured, 403, outage — leaves the manual fields as the way through.
    const served = result.endpoint?.httpStatus === 200;

    context.logger?.info(
        `[Credential Service] configured=${result.configured} served=${served}` +
            (result.endpoint?.httpStatus ? ` status=${result.endpoint.httpStatus}` : ''),
    );

    const status: CredentialServiceStatus = {
        served,
        verdict: result.verdict,
        ...(result.endpoint?.httpStatus !== undefined
            ? { httpStatus: result.endpoint.httpStatus }
            : {}),
    };
    return { success: true, data: status };
}
