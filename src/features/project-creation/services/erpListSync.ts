/**
 * Tell the ERP integration which ERPs it serves (AB-16): `PUT erp/erps` with every deployed
 * ERP linked to it, built by `erpListFor`. Run after an ERP is added from the integration's
 * card, and before one is removed (without it), so the integration never routes a line to an
 * ERP that is gone.
 *
 * Each ERP added from the card lives in a workspace of its own and answers only that
 * workspace's credential (AB-16a), so an add reads each one's credential and sends it with its
 * entry. A credential that cannot be read is a warning, not a failure: the list still goes,
 * without it. The secret is held in memory for the PUT only: never logged, never returned.
 *
 * When the list grows from ONE ERP to several, the first ERP's rule is pinned on its own entry
 * in the same PUT (`pinLoneErpRule`). A lone ERP owns by the integration's shared rule (unset:
 * everything); once there are several, an entry with no rule of its own is read as
 * `erp_owner=<its id>` (commerce-erp-integration `router/ownership.js` `ownershipOf`). Without
 * the pin, adding a second ERP silently moved the first to a rule nobody set: on Justrite
 * (2026-10-22) it then owned 0 of 321 products and the add's pass marked them discontinued.
 * Every path that grows the list (the card's add, the agent's add_erp, a deploy's relist) sends
 * it here, so the pin holds for all of them.
 *
 * A composition file: it wires the integration's client, the signed-in identity and the
 * credential reader into the pure list.
 *
 * @module features/project-creation/services/erpListSync
 */

import type { AppManagementAuth } from '@/features/app-builder/services/appManagementClient';
import type { ErpCredentialRead } from '@/features/app-builder/services/erpCredential';
import { ErpIntegrationClient } from '@/features/app-builder/services/erpIntegrationClient';
import { erpListFor, erpsWithOwnCredential, type ErpAuth, type ErpListEntry } from '@/features/app-builder/services/erpList';
import { ownsRuleOf, ownsSettingsOf } from '@/features/app-builder/services/erpOwnership';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import type { Project } from '@/types/base';
import { toError } from '@/types/typeGuards';

export type ErpListSyncOutcome =
    | { status: 'registered'; ids: string[]; warnings: string[] }
    | { status: 'failed'; detail: string };

/** What a sync may be given beyond the project, the integration and the identity. */
interface ErpListSyncOptions {
    /** An ERP being removed, left out of the list. */
    leaving?: string;
    /** fetch, injectable for tests. */
    fetchImpl?: typeof fetch;
    /**
     * Reads an added ERP's credential from its workspace. Without it no `auth` is sent, and
     * the integration keeps the credentials it holds (a removal needs none).
     */
    readCredential?: ErpCredentialRead;
}

/** Each added ERP's credential, and a warning for each that could not be read. */
async function readCredentials(
    project: Project,
    integrationId: string,
    options: ErpListSyncOptions,
): Promise<{ auths: Record<string, ErpAuth>; warnings: string[] }> {
    const auths: Record<string, ErpAuth> = {};
    const warnings: string[] = [];
    const read = options.readCredential;
    if (!read) return { auths, warnings };
    for (const erp of erpsWithOwnCredential(project, integrationId, getAppBuilderComponentCatalog(), options.leaving)) {
        try {
            if (!erp.workspace) throw new Error('it records no workspace of its own');
            auths[erp.componentId] = await read(erp.workspace);
        } catch (error) {
            const reason = toError(error).message.replace(/[.\s]*$/u, '');
            warnings.push(`${erp.name}'s credential could not be read; the integration cannot reach it: ${reason}.`);
        }
    }
    return { auths, warnings };
}

/** An entry's own settings, as an object; none is an empty one. */
function ownSettingsOf(entry: ErpListEntry): Record<string, unknown> {
    const { settings } = entry;
    return settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {};
}

/**
 * The list to send, with the lone ERP's rule pinned on its entry when the list is growing
 * from it to several and it never saved a rule of its own. Its rule is read as the
 * integration resolves it while it is still alone; a read that fails throws, so a list that
 * would change the first ERP's rule is never sent.
 */
async function pinLoneErpRule(
    client: ErpIntegrationClient,
    current: readonly ErpListEntry[],
    entries: ErpListEntry[],
): Promise<ErpListEntry[]> {
    if (current.length !== 1 || entries.length < 2) return entries;
    const lone = current[0];
    const index = entries.findIndex((entry) => entry.id === lone.id);
    if (index < 0 || ownSettingsOf(entries[index]).structure_owns) return entries;
    const inForce = ownsRuleOf((await client.resolvedSettings([], lone.id)).default);
    const pinned = { ...entries[index], settings: { ...ownSettingsOf(entries[index]), ...ownsSettingsOf(inForce) } };
    return entries.map((entry, at) => (at === index ? pinned : entry));
}

/**
 * Replace the integration's ERP list with the ERPs the project links to it. Never throws.
 *
 * @param project - the project
 * @param integrationId - the ERP integration
 * @param auth - the signed-in identity its actions take
 * @param options - the ERP leaving, fetch, and the credential reader
 * @returns the ids now listed with any credential warnings, or why the list was not replaced
 */
export async function syncErpList(
    project: Project,
    integrationId: string,
    auth: AppManagementAuth | undefined,
    options: ErpListSyncOptions = {},
): Promise<ErpListSyncOutcome> {
    const integration = project.appBuilderComponents?.[integrationId];
    if (!integration) return { status: 'failed', detail: `"${integrationId}" is not in this project.` };
    if (!auth) return { status: 'failed', detail: 'Adobe sign-in required.' };
    const client = new ErpIntegrationClient(integration.deployedUrls, auth, options.fetchImpl);
    if (!client.keepsErpList()) {
        const name = integration.name ?? integrationId;
        return { status: 'failed', detail: `${name} serves one ERP only. Update it to serve several.` };
    }
    try {
        const { auths, warnings } = await readCredentials(project, integrationId, options);
        const catalog = getAppBuilderComponentCatalog();
        const current = await client.listErps();
        const listed = erpListFor(project, integrationId, catalog, current, options.leaving, auths);
        const entries = await pinLoneErpRule(client, current, listed);
        await client.replaceErps(entries);
        return { status: 'registered', ids: entries.map((entry) => entry.id), warnings };
    } catch (error) {
        return { status: 'failed', detail: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Take one ERP out of the integration's list before it is removed (the runner's
 * `unlistSystem`). Answers why it could not, or undefined.
 *
 * @param project - the project
 * @param integrationId - the ERP integration
 * @param erpId - the ERP being removed, by its component id
 * @param auth - the signed-in identity
 * @returns the reason, when the list was not replaced
 */
export async function unlistErp(
    project: Project,
    integrationId: string,
    erpId: string,
    auth: AppManagementAuth | undefined,
): Promise<string | undefined> {
    const outcome = await syncErpList(project, integrationId, auth, { leaving: erpId });
    return outcome.status === 'failed' ? outcome.detail : undefined;
}
