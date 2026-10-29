/**
 * Where an ADDED ERP sends its events, and the credential it signs them with (AB-16i).
 *
 * An ERP raises events (a credit change, a block, a shipment) and posts them to its
 * integration's ingestion web action. The integration's own ERP shares its workspace, so it
 * finds that action from its own namespace and signs with its own credential. An ERP added
 * from the integration's card lives in a workspace of its own (AB-16), where no integration
 * listens — and the ingestion action is `require-adobe-auth` in the INTEGRATION's workspace,
 * so it refuses the ERP's own technical account even at the right address (measured from
 * commerce-erp-integration `actions/ingestion/actions.config.yaml`, 2026-09-28).
 *
 * So an added ERP is deployed with the integration's ingestion address and a publishing
 * credential from the integration's workspace, the way a real ERP posts to middleware with a
 * credential the middleware issued. demo-erp signs with it when all of `EVENTS_AUTH_*` are
 * given (its `lib/events.js`), and with its own credential otherwise.
 *
 * SECRET HYGIENE: the env this answers carries a live client secret. It joins the deploy's
 * per-invocation process env, as the ERP's screen key and the integration's IMS credential do,
 * and nothing here logs or persists it.
 *
 * @module features/app-builder/services/erpEventsDelivery
 */

import { deployWorkspaceId } from './componentWorkspace';
import { erpCredentialReader, type ErpCredentialRead } from './erpCredential';
import type { ErpAuth } from './erpList';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { CachedOrgRef } from '@/core/shell/orgContextEnv';
import { integrationUsing, isAddedSystem } from '@/features/components/services/appBuilderComponentLinks';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';
import { toError } from '@/types/typeGuards';

/** The ingestion web action's deployed URL ends with this (package `ingestion`, action `webhook`). */
const INGESTION_SUFFIX = '/ingestion/webhook';

/** The deploy inputs demo-erp reads (its `app.config.yaml`). */
const ERP_EVENTS_INPUTS = {
    webhookUrl: 'EVENTS_WEBHOOK_URL',
    clientId: 'EVENTS_AUTH_CLIENT_ID',
    clientSecret: 'EVENTS_AUTH_CLIENT_SECRET',
    orgId: 'EVENTS_AUTH_ORG_ID',
    scopes: 'EVENTS_AUTH_SCOPES',
} as const;

/** What an added ERP's deploy gains, and a sentence for the SC when it gains nothing it needs. */
export interface ErpEventsEnv {
    env: Record<string, string>;
    note?: string;
}

/** The integration an added ERP posts to: its id, name, workspace and ingestion address. */
interface EventsTarget {
    integrationName: string;
    workspace: { id: string; name: string };
    webhookUrl?: string;
}

/**
 * The integration serving this system: the one it is linked to, else — on its first add,
 * before the link is written — the one integration of the kind it is bound to.
 */
function servingIntegration(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    catalog: AppBuilderComponentCatalogEntry[],
): string | undefined {
    const linked = integrationUsing(project, entry.id, catalog);
    if (linked) return linked;
    const ofKind = Object.entries(project.appBuilderComponents ?? {})
        .filter(([id, state]) => state.kind === 'integration' && (state.catalogId ?? id) === entry.boundTo)
        .map(([id]) => id);
    return ofKind.length === 1 ? ofKind[0] : undefined;
}

/**
 * The integration an ADDED listed system posts its events to, or undefined for anything
 * else: the integration's own ERP, a system that is not listed, a system with no integration.
 */
function erpEventsTarget(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    catalog: AppBuilderComponentCatalogEntry[],
): EventsTarget | undefined {
    if (entry.kind !== 'system' || !entry.listedAs || !entry.boundTo) return undefined;
    const integrationId = servingIntegration(project, entry, catalog);
    if (!integrationId || !isAddedSystem(project, entry.id, integrationId)) return undefined;
    const integration = project.appBuilderComponents?.[integrationId];
    const workspaceId = deployWorkspaceId(project, integrationId);
    if (!integration || !workspaceId) return undefined;
    const webhookUrl = Object.values(integration.deployedUrls ?? {}).find((url) => url.endsWith(INGESTION_SUFFIX));
    return {
        integrationName: integration.name ?? integrationId,
        workspace: {
            id: workspaceId,
            name: integration.workspace?.name ?? project.adobe?.workspaceName ?? workspaceId,
        },
        ...(webhookUrl ? { webhookUrl } : {}),
    };
}

/**
 * The five deploy inputs: the ingestion address and the publishing credential.
 *
 * @param webhookUrl - the integration's ingestion web action URL
 * @param credential - the integration workspace's server-to-server credential
 * @returns input name → value
 */
function buildErpEventsEnv(webhookUrl: string, credential: ErpAuth): Record<string, string> {
    return {
        [ERP_EVENTS_INPUTS.webhookUrl]: webhookUrl,
        [ERP_EVENTS_INPUTS.clientId]: credential.clientId,
        [ERP_EVENTS_INPUTS.clientSecret]: credential.clientSecret,
        [ERP_EVENTS_INPUTS.orgId]: credential.orgId,
        [ERP_EVENTS_INPUTS.scopes]: JSON.stringify(credential.scopes),
    };
}

/**
 * What an entry's deploy gains so its events reach its integration. Nothing for anything
 * but an added ERP. An added ERP whose integration has no ingestion address yet, or whose
 * integration's credential cannot be read, deploys as it did before — its events stay in
 * its own outbox — and the answer says so.
 *
 * @param project - the project
 * @param entry - the entry being deployed
 * @param catalog - the App Builder catalog
 * @param readCredential - reads a workspace's credential (`erpCredentialReader`)
 * @returns the env to merge into the deploy, and a note when it is incomplete
 */
export async function resolveErpEventsEnv(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    catalog: AppBuilderComponentCatalogEntry[],
    readCredential: ErpCredentialRead,
): Promise<ErpEventsEnv> {
    const target = erpEventsTarget(project, entry, catalog);
    if (!target) return { env: {} };
    const name = project.appBuilderComponents?.[entry.id]?.name ?? entry.name;
    const unsent = `${name}'s events will wait in its own outbox`;
    if (!target.webhookUrl) {
        return {
            env: {},
            note: `${unsent}: ${target.integrationName} has no event address yet. Redeploy ${name} once it is deployed.`,
        };
    }
    try {
        return { env: buildErpEventsEnv(target.webhookUrl, await readCredential(target.workspace)) };
    } catch (error) {
        return {
            env: {},
            note: `${unsent}: ${target.integrationName}'s credential could not be read (${toError(error).message}). Redeploy ${name} to try again.`,
        };
    }
}

/** What the production resolver needs from the runner's host context. */
interface EventsEnvContext {
    commandManager: CommandExecutor;
    catalog: AppBuilderComponentCatalogEntry[];
    getCachedOrganization: () => CachedOrgRef | undefined;
}

/**
 * The runner's `resolveEventsEnv`: {@link resolveErpEventsEnv} reading the integration
 * workspace's credential with `erpCredentialReader`, aimed at that workspace.
 *
 * @param ctx - the runner deps context
 * @returns the resolver
 */
export function erpEventsEnvResolver(
    ctx: EventsEnvContext,
): (project: Project, entry: AppBuilderComponentCatalogEntry) => Promise<ErpEventsEnv> {
    return (project, entry) =>
        resolveErpEventsEnv(
            project,
            entry,
            ctx.catalog,
            erpCredentialReader(ctx.commandManager, project, ctx.getCachedOrganization()),
        );
}
