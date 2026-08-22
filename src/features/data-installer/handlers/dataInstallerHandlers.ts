/**
 * Data Installer webview/agent message handlers.
 *
 * Six read message types, each three lines: guard, client call, response. All the
 * judgement lives in {@link resolveDataInstallerAccess}, so a new handler cannot
 * accidentally skip a check.
 *
 * These handlers serve BOTH surfaces — the webview panel and the MCP tools — which
 * is why the guard branches on `context.panel`. `ensureAdobeIOAuth` shows a VS Code
 * warning notification: correct from a webview, wrong from an agent tool, where it
 * would pop a modal on the user's window and block the tool until someone clicks.
 * The headless branch checks authentication and hands back a `needsAuth` marker
 * instead of prompting.
 *
 * @module features/data-installer/handlers/dataInstallerHandlers
 */

import { DataInstallerClient } from '../services/dataInstallerClient';
import {
    isDataInstallerEnabled,
    resolveDataInstallerBaseUrl,
} from '../services/dataInstallerConfig';
import { DataInstallerApiError, isDataInstallerAuthError } from '../services/dataInstallerErrors';
import type { DatapackId, OperationMode } from '../types';
import { ensureAdobeIOAuth } from '@/core/auth/adobeAuthGuard';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

const LOG_PREFIX = '[Data Installer]';

/**
 * A ready client, or the response to return instead.
 *
 * Carries the resolved `baseUrl` and token provider as well as the read client,
 * so the WRITE handlers can build their own client without repeating the guard.
 * One guard means a new write handler cannot skip a check by construction.
 *
 * Deliberately does NOT carry a `PollingService`. Constructing one reaches for
 * the global logger, which would drag that dependency into every read path for
 * the benefit of one write handler — it broke this file's own suite when tried.
 * The importer builds its own.
 */
export type DataInstallerAccess =
    | {
          ok: true;
          client: DataInstallerClient;
          baseUrl: string;
          getToken: () => Promise<string>;
      }
    | { ok: false; response: HandlerResponse };

/** Shape a guard refusal into a HandlerResponse with an actionable code. */
function refuse(
    error: string,
    code: ErrorCode,
    extra: Record<string, unknown> = {},
): DataInstallerAccess {
    return { ok: false, response: { success: false, error, code, ...extra } };
}

/**
 * Resolve an authorized client, or the reason we cannot have one.
 *
 * Order matters: the cheap local checks run before anything that could prompt the
 * user or hit the network.
 */
export async function resolveDataInstallerAccess(
    context: HandlerContext,
): Promise<DataInstallerAccess> {
    // Both config refusals LOG. They used to return in silence, and a colleague's
    // 864-line debug log carried zero lines from this feature while the catalog
    // failed on every surface she could reach — the log is the support artifact,
    // so a refusal that leaves no trace costs a round trip to her settings.
    //
    // The refusal keeps its INVALID_OPERATION code, which is what
    // `renderDataInstallerFailure` already branches on to offer the settings fix.
    if (!isDataInstallerEnabled()) {
        context.logger.warn(`${LOG_PREFIX} Refused: demoBuilder.dataInstaller.enabled is false.`);
        return refuse(
            'The Data Installer is turned off. Enable demoBuilder.dataInstaller.enabled to use it.',
            ErrorCode.INVALID_OPERATION,
        );
    }

    const resolved = resolveDataInstallerBaseUrl();
    if (!resolved.ok) {
        // Fingerprint only: a rejected URL may carry a secret in its query string.
        context.logger.warn(
            resolved.reason === 'not-configured'
                ? `${LOG_PREFIX} Refused: demoBuilder.dataInstaller.apiBaseUrl is not set. It has no default — every install needs it set once.`
                : `${LOG_PREFIX} Refused: invalid demoBuilder.dataInstaller.apiBaseUrl (${resolved.fingerprint ?? 'unreadable'}). Expected https://.`,
        );
        return refuse(
            resolved.reason === 'not-configured'
                ? 'No Data Installer API URL is configured. Set demoBuilder.dataInstaller.apiBaseUrl.'
                : 'The configured Data Installer API URL is not usable. It must be an https:// URL.',
            ErrorCode.INVALID_OPERATION,
        );
    }

    const authManager = context.authManager;
    if (!authManager) {
        return refuse('Adobe sign-in is required.', ErrorCode.AUTH_REQUIRED);
    }

    const interactive = context.panel !== undefined;
    if (interactive) {
        const authResult = await ensureAdobeIOAuth({
            authManager,
            logger: context.logger,
            logPrefix: LOG_PREFIX,
            warningMessage: 'Adobe sign-in required to browse Data Installer datapacks.',
        });
        if (!authResult.authenticated) {
            return refuse('Adobe sign-in is required.', ErrorCode.AUTH_REQUIRED);
        }
    } else if (!(await authManager.isAuthenticated())) {
        // Agent surface: report, never prompt.
        return refuse(
            'Adobe sign-in required. Check get_auth_status, then sign_in(provider:"adobe") once the user agrees.',
            ErrorCode.AUTH_REQUIRED,
            { needsAuth: 'adobe' },
        );
    }

    const inspection = await authManager.getTokenManager().inspectToken();
    if (!inspection.token) {
        context.logger.warn(
            `${LOG_PREFIX} No IMS token available (valid=${inspection.valid}, expiresIn=${inspection.expiresIn}min).`,
        );
        return refuse('Could not read an Adobe IMS token. Sign in again.', ErrorCode.AUTH_REQUIRED);
    }

    // A provider, not a value: tokens expire mid-session, and a long import
    // outlives the token that started it.
    const getToken = async (): Promise<string> =>
        (await authManager.getTokenManager().inspectToken()).token ?? '';

    return {
        ok: true,
        baseUrl: resolved.baseUrl,
        getToken,
        client: new DataInstallerClient({
            baseUrl: resolved.baseUrl,
            getToken,
            onDrift: (endpoint, missingKeys) => {
                context.logger.warn(
                    `${LOG_PREFIX} shape-drift ${endpoint} missing=[${missingKeys.join(', ')}]`,
                );
            },
        }),
    };
}

/** Turn a thrown error into a response the UI can act on. */
function toFailure(error: unknown, fallback: string): HandlerResponse {
    if (isDataInstallerAuthError(error)) {
        return {
            success: false,
            error: 'Adobe sign-in is required.',
            code: ErrorCode.AUTH_REQUIRED,
        };
    }
    // UNKNOWN is the enum's documented fallback "when no specific code applies",
    // and it maps to a Retry affordance — which is the right offer for a 5xx.
    if (error instanceof DataInstallerApiError) {
        return { success: false, error: error.message, code: ErrorCode.UNKNOWN };
    }
    return {
        success: false,
        error: error instanceof Error ? error.message : fallback,
        code: ErrorCode.UNKNOWN,
    };
}

/** Run one client call behind the guard, mapping both failure kinds. */
async function withClient(
    context: HandlerContext,
    fallback: string,
    run: (client: DataInstallerClient) => Promise<unknown>,
): Promise<HandlerResponse> {
    const access = await resolveDataInstallerAccess(context);
    if (!access.ok) {
        return access.response;
    }
    try {
        return { success: true, data: await run(access.client) };
    } catch (error) {
        // Logged for the same reason the refusals above are: without this, a
        // service that is down and a setting that was never filled in produce
        // the same empty log, and telling them apart is the only reason to read one.
        context.logger.error(
            `${LOG_PREFIX} ${fallback} ${error instanceof Error ? error.message : String(error)}`,
        );
        return toFailure(error, fallback);
    }
}

/**
 * Payload for the catalog listing.
 *
 * No `search`: the service has no server-side name filter, so the field was
 * declared and silently ignored — a lie the MCP tool would have advertised.
 * Filtering is the caller's, over the page it holds.
 */
// Exported because the wizard's composite map registers `find-datapacks`, and
// TypeScript cannot NAME the map's inferred type while this stays local.
export interface FindDatapacksPayload {
    includeCommunity?: boolean;
    limit?: number;
    skip?: number;
}

/** Payload identifying one datapack. */
interface DatapackRefPayload {
    datapackName?: string;
    version?: string;
}

export const dataInstallerHandlers = defineHandlers({
    'check-datapack-service': async (context: HandlerContext): Promise<HandlerResponse> =>
        withClient(context, 'Could not reach the Data Installer API.', (client) =>
            client.checkHealth(),
        ),

    'find-datapacks': async (
        context: HandlerContext,
        payload?: FindDatapacksPayload,
    ): Promise<HandlerResponse> =>
        withClient(context, 'Could not list datapacks.', (client) =>
            client.findDatapacks({
                // Curated by default: 23 of 40 live entries are shared, and the
                // rest is developer scratch nobody wants to browse.
                ...(payload?.includeCommunity ? {} : { shared: true }),
                ...(payload?.limit !== undefined ? { limit: payload.limit } : {}),
                ...(payload?.skip !== undefined ? { skip: payload.skip } : {}),
            }),
        ),

    'get-datapack-detail': async (
        context: HandlerContext,
        payload?: DatapackRefPayload,
    ): Promise<HandlerResponse> => {
        const id = toDatapackId(payload);
        if (!id) {
            return { success: false, error: 'A datapack name and version are required.' };
        }
        return withClient(context, 'Could not load the datapack.', async (client) => {
            const detail = await client.getDatapackDetail(id);
            // Explicit types only — omitting them returns a 400 from the service.
            const inventory =
                detail.dataTypes.length > 0
                    ? await client.batchGetDataItems(id, detail.dataTypes)
                    : {
                          present: [],
                          missing: [],
                          presentCount: 0,
                          missingCount: 0,
                          requestedCount: 0,
                      };
            return { detail, inventory };
        });
    },

    'list-datapack-data-types': async (
        context: HandlerContext,
        payload?: { operationMode?: OperationMode },
    ): Promise<HandlerResponse> => {
        const mode = payload?.operationMode;
        if (!mode) {
            return {
                success: false,
                // No default: the import and export sets genuinely differ, so
                // guessing one would offer the wrong types.
                error: 'An operation mode is required (import, export, delete or validate).',
            };
        }
        return withClient(context, 'Could not list data types.', async (client) => ({
            mode,
            dataTypes: await client.getProcessorOrder(mode),
            catalog: mode === 'export' ? await client.getExportDataTypes() : undefined,
        }));
    },

    'list-installed-datapacks': async (
        context: HandlerContext,
        payload?: {
            commerceInstance?: string;
            datapackName?: string;
            limit?: number;
            skip?: number;
        },
    ): Promise<HandlerResponse> =>
        withClient(context, 'Could not list installed datapacks.', (client) =>
            client.getInstalledDatapacks({ ...(payload ?? {}) }),
        ),

    'get-datapack-activity': async (
        context: HandlerContext,
        payload?: {
            datapackName?: string;
            commerceInstance?: string;
            operationMode?: OperationMode;
            limit?: number;
            skip?: number;
        },
    ): Promise<HandlerResponse> =>
        withClient(context, 'Could not load activity.', (client) =>
            client.getActivityLog({ ...(payload ?? {}) }),
        ),
});

/** Build an identity from a payload, or undefined when either half is missing. */
function toDatapackId(payload?: DatapackRefPayload): DatapackId | undefined {
    const name = payload?.datapackName;
    const version = payload?.version;
    return name && version ? { name, version } : undefined;
}
