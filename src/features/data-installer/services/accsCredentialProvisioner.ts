/**
 * Console-free ACCS credential provisioning.
 *
 * The loop every ACCS import needs, with no Developer Console visit: ensure the
 * shared `demo-builder-s2s` OAuth Server-to-Server credential exists on the
 * project's workspace, make sure `ACCS-REST-API` is subscribed to it (that
 * subscription IS the entitlement — it moves the credential's scopes from
 * `AdobeID,openid` to `commerce.accs` + `additional_info.*`, which flips the
 * Data Installer's pre-flight from 400 to 200), then read the pair back out of
 * the workspace download. Every step was rehearsed live against the real
 * Console and service on 2026-08-13 before this module existed.
 *
 * Three rules carry the weight:
 *
 * - **Subscribe the UNION, never just the new code.** The subscribe endpoint is
 *   a PUT that REPLACES the list — one code alone unsubscribes everything else
 *   on the shared credential (the App Builder full-union rule).
 * - **Direct S2S subscribe, not the axis-filtered path.** `ACCS-REST-API`
 *   carries `oauthServerToServerOnly: true` but a `platformList` of web-app
 *   types, and the subscribe axis filter reads only `platformList` — so
 *   `add_console_apis` silently drops the one service that is S2S-only.
 * - **The secret exists only in the returned value.** The injected logger gets
 *   step names; ids and secrets never reach it.
 *
 * Pure orchestration over injected deps — no vscode, no fetch, no fs — so the
 * whole loop is testable and the handler owns the wiring.
 *
 * @module features/data-installer/services/accsCredentialProvisioner
 */

/** The Console service whose subscription grants the Commerce scopes. */
const ACCS_SERVICE_CODE = 'ACCS-REST-API';

/** The auth surface this loop needs — matched to `AuthenticationService`. */
export interface ProvisionerAuth {
    getWorkspaceS2SCredential: (
        orgId: string,
        projectId: string,
        workspaceId: string,
    ) => Promise<{ clientId: string; idIntegration: string } | undefined>;
    createWorkspaceS2SCredentialFor: (
        orgId: string,
        projectId: string,
        workspaceId: string,
    ) => Promise<{ clientId: string; idIntegration: string }>;
    getSubscribedServiceCodes: (orgId: string, idIntegration: string) => Promise<string[]>;
    subscribeOAuthServerToServerIntegrationToServices: (
        orgId: string,
        idIntegration: string,
        serviceInfo: Array<{ sdkCode: string; licenseConfigs: null; roles: null }>,
    ) => Promise<void>;
}

export interface ProvisionerDeps {
    auth: ProvisionerAuth;
    /**
     * The raw workspace-download JSON for EXPLICIT ids — never the selected CLI
     * context, which was stale (404) live while the project's binding was fine.
     * The implementation owns the temp-file hygiene (0700 dir, delete in
     * `finally`), copied from `runtimeCredentials.ts`.
     */
    downloadWorkspaceJson: (target: ProvisionTarget) => Promise<string>;
    /** Step names only. Ids and secrets must never reach this. */
    log: (line: string) => void;
}

export interface ProvisionTarget {
    orgId: string;
    projectId: string;
    workspaceId: string;
}

export type ProvisionResult =
    | { ok: true; clientId: string; clientSecret: string }
    | { ok: false; reason: string };

/** Shape of the workspace download, only as deep as this loop reads. */
interface WorkspaceJson {
    project?: {
        workspace?: {
            details?: {
                credentials?: Array<{
                    integration_type?: string;
                    oauth_server_to_server?: {
                        client_id?: string;
                        client_secrets?: string[];
                    };
                }>;
            };
        };
    };
}

/**
 * The S2S credential inside a workspace download.
 *
 * A named getter rather than a four-level optional chain inline (project rule:
 * extract above two levels), so "the download had no such credential" has one
 * place to fail and one place to be tested.
 */
function readS2SCredential(
    parsed: WorkspaceJson,
): { client_id?: string; client_secrets?: string[] } | undefined {
    const credentials = parsed.project?.workspace?.details?.credentials ?? [];
    return credentials.find((entry) => entry.integration_type === 'oauth_server_to_server')
        ?.oauth_server_to_server;
}

/**
 * Run the loop. Failures come back as reasons, never throws — the caller shows
 * them beside the manual paste-the-pair path, which always remains available.
 */
export async function provisionAccsCredentials(
    deps: ProvisionerDeps,
    target: ProvisionTarget,
): Promise<ProvisionResult> {
    const { auth, log } = deps;
    const { orgId, projectId, workspaceId } = target;

    try {
        log('ensuring the OAuth Server-to-Server credential exists');
        const credential =
            (await auth.getWorkspaceS2SCredential(orgId, projectId, workspaceId)) ??
            (await auth.createWorkspaceS2SCredentialFor(orgId, projectId, workspaceId));

        const subscribed = await auth.getSubscribedServiceCodes(orgId, credential.idIntegration);
        if (!subscribed.includes(ACCS_SERVICE_CODE)) {
            log(`subscribing ${ACCS_SERVICE_CODE} (union of ${subscribed.length + 1} services)`);
            const union = [...subscribed, ACCS_SERVICE_CODE].map((sdkCode) => ({
                sdkCode,
                licenseConfigs: null,
                roles: null,
            }));
            await auth.subscribeOAuthServerToServerIntegrationToServices(
                orgId,
                credential.idIntegration,
                union,
            );
        } else {
            log(`${ACCS_SERVICE_CODE} already subscribed`);
        }

        log('reading the pair from the workspace configuration');
        const raw = await deps.downloadWorkspaceJson(target);
        // Parsed in its OWN try: `raw` holds the client secret, and Node's
        // JSON.parse SyntaxError quotes ~30 characters of the offending input.
        // Left to the outer catch that message would reach `log()` and the
        // returned `reason` — which the handler writes to debugLogger.debug()
        // (no redaction there; only error()/trace() sanitize) and renders in the
        // modal. A truncated download would then put part of a secret in a
        // Debug Logs dump someone pastes into a ticket.
        let parsed: WorkspaceJson;
        try {
            parsed = JSON.parse(raw) as WorkspaceJson;
        } catch {
            return {
                ok: false,
                reason:
                    'The workspace configuration could not be read. Download it again, or copy ' +
                    'the credential pair from the Developer Console.',
            };
        }
        const s2s = readS2SCredential(parsed);

        const clientId = s2s?.client_id;
        const clientSecret = s2s?.client_secrets?.[0];
        if (!clientId || !clientSecret) {
            return {
                ok: false,
                reason:
                    'The workspace configuration carries no client secret for the credential. ' +
                    'Copy the pair from the Developer Console instead.',
            };
        }

        log('provisioning complete');
        return { ok: true, clientId, clientSecret };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(`provisioning failed: ${message}`);
        return { ok: false, reason: message };
    }
}
