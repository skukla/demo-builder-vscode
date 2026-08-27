/**
 * The `AIO_COMMERCE_AUTH_IMS_*` deploy env for App Management apps.
 *
 * The kit's generated actions authenticate to Commerce and I/O Events with an
 * IMS server-to-server credential, wired as action inputs from DEPLOY-TIME env
 * (`ext.config.yaml`: `AIO_COMMERCE_AUTH_IMS_CLIENT_ID:
 * $AIO_COMMERCE_AUTH_IMS_CLIENT_ID`, six in all — read from the kit source
 * 2026-08-27). Without them the app deploys but its installer fails at the
 * `eventing` step with "Can't resolve authentication options" — the exact
 * failure the first live install produced.
 *
 * The SIX var names are `IMS_AUTH_PARAMS` in aio-commerce-lib-auth (read from
 * its source, same day). Array-valued vars (`CLIENT_SECRETS`, `SCOPES`) take a
 * JSON array string — the lib's parser accepts `["…"]` explicitly.
 *
 * SCOPES is a baseline only: aio-commerce-lib-api ENSURES its own required
 * scopes per call (`ensureImsScopes` appends `openid`,
 * `additional_info.projectedProductContext`, `commerce.accs`, `adobeio_api` as
 * needed), so the env value need not enumerate them. What DOES gate those
 * scopes is the credential's service subscription — the subscribe spine's
 * baseline (`AdobeIOManagementAPISDK`) covers `adobeio_api`.
 *
 * SECRET HYGIENE: the returned map carries a live client secret. It goes into
 * a per-invocation process env only — never persisted, never logged (the
 * executor logs command lines, not env).
 *
 * @module features/app-builder/services/s2sDeployEnv
 */

import type { S2SDeployCredentials } from '@/features/authentication/services/types';

/** Baseline IMS scopes; the kit's lib appends what each call needs. */
const BASELINE_IMS_SCOPES = ['AdobeID', 'openid'];

/**
 * Build the six `AIO_COMMERCE_AUTH_IMS_*` env vars from the workspace S2S
 * credential.
 *
 * @param credentials - the credential's full IMS identity
 * @returns the env map to merge into the deploy invocation
 */
export function buildS2SDeployEnv(credentials: S2SDeployCredentials): Record<string, string> {
    return {
        AIO_COMMERCE_AUTH_IMS_CLIENT_ID: credentials.clientId,
        AIO_COMMERCE_AUTH_IMS_CLIENT_SECRETS: JSON.stringify([credentials.clientSecret]),
        AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_ID: credentials.technicalAccountId,
        AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_EMAIL: credentials.technicalAccountEmail,
        AIO_COMMERCE_AUTH_IMS_ORG_ID: credentials.imsOrgCode,
        AIO_COMMERCE_AUTH_IMS_SCOPES: JSON.stringify(BASELINE_IMS_SCOPES),
    };
}
