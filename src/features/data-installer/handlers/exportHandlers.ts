/**
 * Export handlers — Stage 3: capture a datapack FROM a Commerce instance.
 *
 * The service's documented two-step flow, in two message types:
 * `list-datapack-export-items` (what is here to capture) and
 * `start-datapack-export` (capture it). Merged into `importHandlers` so the
 * panel and its tests keep one map to reach for; separate here because the
 * import spine was already at its size limit.
 *
 * Three contracts, all measured live 2026-08-14 and several contrary to the
 * vendor docs — see `docs/systems/data-installer.md` §6b:
 *
 * - **Two instance forms.** `process-datapack` takes the ACCS tenant id;
 *   `get-export-items` refuses it and needs the REST base URL, because the
 *   deployment config that enables the id shorthand is not set for that action.
 *   {@link deriveRestBaseUrl} produces the second from the project.
 * - **`verbose` is mandatory**, enforced in the write client: without it a
 *   failed export returns an all-zero summary and no reason at all.
 * - **A failed export is a VERDICT**, not a failed call — `success: true` with
 *   the per-type reasons in `data`, matching the dry run's shape.
 *
 * The guards refuse a half-named target before the request goes out. The catalog
 * is shared infrastructure — 23 curated entries other teams depend on — and the
 * service will not stop a pack written under the wrong name.
 *
 * @module features/data-installer/handlers/exportHandlers
 */

import { canProvisionAccsCredentials } from '../services/accsProvisionEligibility';
import { brokerForContext } from '../services/commerceCredentialBroker';
import { resolveCommerceCredentials } from '../services/commerceCredentials';
import {
    DataInstallerWriteClient,
    type ExportRequest,
} from '../services/dataInstallerWriteClient';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import { ACCS_GRAPHQL_ENDPOINT, PAAS_URL } from '@/features/components/config/envVarKeys';
import { lookupComponentConfigValue } from '@/features/components/services/envVarHelpers';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

/** Wording for each credential gap, mirroring the import spine's. */
const CREDENTIAL_MESSAGES: Record<string, string> = {
    'missing-paas-admin':
        'This project has no Commerce admin username and password saved, so an export cannot authenticate.',
    'needs-accs-credentials':
        'ACCS exports need an Adobe OAuth Server-to-Server client id and secret, and the shared credential service did not supply one. Add the pair to this project, or ask an administrator for access to the shared credential.',
    'unsupported-backend':
        'This project has no Adobe Commerce backend, so there is nothing to export from.',
    'no-credential-service':
        'ACCS exports need an Adobe OAuth Server-to-Server client id and secret, and no shared credential service is configured to supply one. Add a service under demoBuilder.accsDiscovery.services, or add the pair to this project.',
};

export const exportHandlers = defineHandlers({
    /**
     * What this instance holds for one data type — step 1 of an export.
     *
     * The list endpoint cannot resolve an ACCS tenant id, so it gets the REST
     * base URL derived from the project's own ACCS GraphQL endpoint. That is the
     * only place that URL exists.
     */
    'list-datapack-export-items': async (
        context: HandlerContext,
        payload?: ExportPayload,
    ): Promise<HandlerResponse> => {
        if (!payload?.dataType) {
            return { success: false, error: 'Choose a data type to list.' };
        }
        const prepared = await prepareExport(context, payload);
        if ('response' in prepared) {
            return prepared.response;
        }
        try {
            const page = await prepared.writeClient.listExportItems(
                prepared.request,
                payload.dataType,
            );
            return { success: true, data: page };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Could not list what is available.',
                code: ErrorCode.UNKNOWN,
            };
        }
    },

    /**
     * Capture the chosen data into a datapack — step 2.
     *
     * Synchronous on purpose: unlike an import, the service's export path gives
     * no activation id to watch, and its own docs show the result returning
     * inline.
     *
     * A failed export is a VERDICT, not a failed call: `success: true` with the
     * per-type reasons in `data`, the same shape the dry run uses. The reason
     * only exists because the client asks for `verbose` — see the write client.
     */
    'start-datapack-export': async (
        context: HandlerContext,
        payload?: ExportPayload,
    ): Promise<HandlerResponse> => {
        const prepared = await prepareExport(context, payload);
        if ('response' in prepared) {
            return prepared.response;
        }
        try {
            return { success: true, data: await prepared.writeClient.startExport(prepared.request) };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'The export could not be started.',
                code: ErrorCode.UNKNOWN,
            };
        }
    },
});

/** Payload for the two export message types. */
export interface ExportPayload {
    datapackName?: string;
    version?: string;
    commerceInstance?: string;
    dataTypes?: string[];
    /** List call only: which type to enumerate. */
    dataType?: string;
    /** `{<type>: {<idField>: [ids]}}` — omitted means "everything allowed". */
    selections?: Record<string, Record<string, Array<string | number>>>;
}

/**
 * Guards and wiring shared by both export handlers.
 *
 * An export WRITES into a catalog other teams share, so a half-named target is
 * refused here rather than at the service — which would accept it.
 */
async function prepareExport(
    context: HandlerContext,
    payload: ExportPayload | undefined,
): Promise<
    { writeClient: DataInstallerWriteClient; request: ExportRequest } | { response: HandlerResponse }
> {
    const name = payload?.datapackName;
    const version = payload?.version;
    if (!name || !version) {
        return {
            response: {
                success: false,
                error: 'An export needs a datapack name and a version — together they name what it writes.',
            },
        };
    }
    const commerceInstance = payload?.commerceInstance;
    if (!commerceInstance) {
        return { response: { success: false, error: 'A Commerce instance is required.' } };
    }
    const dataTypes = payload?.dataTypes ?? [];
    if (dataTypes.length === 0) {
        return { response: { success: false, error: 'Select at least one data type to export.' } };
    }

    const access = await resolveDataInstallerAccess(context);
    if (!access.ok) {
        return { response: access.response };
    }
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { response: { success: false, error: 'Open a project before exporting.' } };
    }

    const credentials = await resolveCommerceCredentials({
        project: {
            stackBackend: project.componentSelections?.backend ?? '',
            componentConfigs: project.componentConfigs ?? {},
        },
        secrets: context.context.secrets,
        projectName: project.name,
        broker: brokerForContext(context, project),
    });
    if (!credentials.ok) {
        return {
            response: {
                success: false,
                error: CREDENTIAL_MESSAGES[credentials.reason] ?? 'Commerce credentials are missing.',
                code: ErrorCode.INVALID_OPERATION,
                // Gated on the Adobe binding for the same reason the import
                // spine is: the offer must lead somewhere.
                data: {
                    needsAccsCredentials:
                        credentials.reason === 'needs-accs-credentials' &&
                        canProvisionAccsCredentials(project.adobe),
                },
            },
        };
    }

    return {
        writeClient: new DataInstallerWriteClient({
            baseUrl: access.baseUrl,
            getToken: access.getToken,
            log: (line) => context.debugLogger.debug(`[Data Installer] ${line}`),
        }),
        request: {
            id: { name, version },
            commerceInstance,
            restBaseUrl: deriveRestBaseUrl(project.componentConfigs ?? {}),
            dataTypes,
            credentials: credentials.credentials,
            ...(payload?.selections ? { selections: payload.selections } : {}),
        },
    };
}

/**
 * The Commerce REST root, for the one action that cannot take a tenant id.
 *
 * ACCS: the project's GraphQL endpoint minus its `/graphql` suffix. PaaS: the
 * Commerce URL as configured.
 */
function deriveRestBaseUrl(
    configs: Record<string, Record<string, string | number | boolean | undefined>>,
): string {
    const accs = lookupComponentConfigValue(configs, ACCS_GRAPHQL_ENDPOINT);
    if (accs) {
        return accs.replace(/\/graphql\/?$/, '');
    }
    return lookupComponentConfigValue(configs, PAAS_URL) ?? '';
}
