/**
 * Is the shared Commerce credential service configured, and will it serve you?
 *
 * Diagnostics could not answer either question, and without an answer four very
 * different situations reach the user as the same message — "add an OAuth client
 * id and secret". They need three different people to act:
 *
 * | State | Who fixes it |
 * |---|---|
 * | no service configured | the user, in settings |
 * | configured, 403 | the service administrator, via the email allowlist |
 * | configured, unreachable | nobody — it is an outage, wait |
 * | configured, 200 | nothing; imports will work |
 *
 * The 403 case is why this exists. A user one allowlist entry away from a working
 * import currently gets told to go and find a credential in the Developer Console.
 *
 * **This deliberately does NOT reuse `fetchSharedCommerceCredentials`.** That
 * function returns the pair and hides the status; this one needs the status and
 * must never hold the pair. It never reads the response body at all — a
 * diagnostics report gets pasted into tickets, and the body is a live credential
 * that can write catalog data to every ACCS instance in its org. The few lines of
 * shared request shape are worth less than that guarantee.
 *
 * @module features/data-installer/services/credentialServiceProbe
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { selectCredentialService } from '@/features/eds/services/accsDiscoveryConfig';

export interface CredentialServiceProbeResult {
    /** Whether a usable service URL could be built from settings. */
    configured: boolean;
    /** Which org's entry was selected. Absent when nothing was. */
    orgId?: string;
    /** Why no usable service is configured. Absent when one is. */
    reason?: 'none-configured' | 'invalid-url' | 'not-derivable';
    /** What the endpoint did. Absent when it was never called. */
    endpoint?: { httpStatus?: number; error?: string };
    /** One line naming the state and, where there is one, the remedy. */
    verdict: string;
}

export interface CredentialProbeDeps {
    auth?: { getTokenManager: () => { inspectToken: () => Promise<{ token?: string }> } };
    orgId?: string;
    fetchImpl?: typeof fetch;
}

/** The setting that turns the shared credential on. Safe to print; its value is not. */
const SERVICE_SETTING = 'demoBuilder.accsDiscovery.services';

export async function probeCredentialService(
    deps: CredentialProbeDeps,
): Promise<CredentialServiceProbeResult> {
    const selection = selectCredentialService(deps.orgId);
    if (!selection.ok) {
        return {
            configured: false,
            reason: selection.reason,
            verdict:
                `No credential service is configured, so a project without its own Adobe ` +
                `workspace cannot import sample data. Add one under ${SERVICE_SETTING}.`,
        };
    }

    const base = { configured: true, ...(deps.orgId ? { orgId: deps.orgId } : {}) };

    const token = await readToken(deps.auth);
    if (!token) {
        // Not the service's fault, and saying "unreachable" here would send
        // someone to check an endpoint that is probably fine.
        return {
            ...base,
            verdict: 'Not signed in to Adobe, so the credential service was not contacted. Sign in and run this again.',
        };
    }

    try {
        const response = await (deps.fetchImpl ?? fetch)(selection.serviceUrl, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(TIMEOUTS.QUICK),
        });

        // The body is never read. Status is the whole answer this needs.
        return {
            ...base,
            endpoint: { httpStatus: response.status },
            verdict: verdictForStatus(response.status),
        };
    } catch (error) {
        const name = error instanceof Error ? error.name : 'unknown';
        return {
            ...base,
            endpoint: { error: name === 'AbortError' ? 'timed out' : 'could not connect' },
            verdict: 'Could not reach the credential service. It may be down, or the configured URL may be wrong.',
        };
    }
}

/** The user's IMS token, or undefined for any reason at all. */
async function readToken(deps: CredentialProbeDeps['auth']): Promise<string | undefined> {
    try {
        return (await deps?.getTokenManager().inspectToken())?.token;
    } catch {
        return undefined;
    }
}

/**
 * What a status means for the person reading the report.
 *
 * 403 gets the most specific wording because it is the one with a remedy the
 * user cannot guess: their email domain is not on the service's allowlist, which
 * only whoever deployed the service can change.
 */
function verdictForStatus(status: number): string {
    if (status === 200) {
        return 'Shared credential available — projects without their own Adobe workspace can import sample data.';
    }
    if (status === 403) {
        return 'Your account is not authorized for the shared credential. Ask the service administrator to add your email domain, or add a client id and secret to this project.';
    }
    if (status === 401) {
        return 'The credential service rejected the Adobe session. Sign in again and re-run this check.';
    }
    if (status === 503) {
        return 'The credential service is deployed but not configured. Whoever deployed it needs to set its Commerce credential.';
    }
    return `The credential service answered HTTP ${status}, which is not a state this check knows how to interpret.`;
}
