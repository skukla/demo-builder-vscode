/**
 * The doors to the project's ACO ingestion credential (PL-60, owner 2026-10-31 P2): set it up when
 * ACO comes into the project, remove it when ACO leaves. The steps live in
 * `app-builder/services/acoCredential.ts`; these handlers fetch the services at the boundary and
 * run the App Builder guard chain first (auth, org match, Developer role), as every Console API
 * change does (`consoleApiHandlers.ts`).
 *
 * @module features/dashboard/handlers/acoCredentialHandlers
 */

import { runGuards } from './appBuilderComponentGuards';
import { loadProjectAndGuard, reconcileExtras } from './consoleApiHandlers';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { removeAcoCredential, setUpAcoCredential, type AcoCredentialDeps } from '@/features/app-builder/services/acoCredential';
import { createApiSubscriberClient } from '@/features/app-builder/services/apiSubscriberClientAdapter';
import { ACO_ADDON_ID, usesAco } from '@/features/components/services/acoSettings';
import { addonOffer } from '@/features/components/services/addonOffer';
import { getStackById } from '@/features/components/services/demoPackageLoader';
import { resolveStorefrontForProject } from '@/features/components/services/storefrontResolver';
import { nodeRecordFiles, readProjectRecords } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { Project } from '@/types/base';
import type { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, MessageHandler } from '@/types/handlers';
import type { AddonOffer } from '@/types/stacks';

const NO_ADOBE = 'This project has no Adobe project and workspace yet. Complete Adobe setup first.';
const NO_SECRETS = 'SecretStorage is not available here, so Demo Builder cannot keep the ACO credential.';

/** The steps' Adobe and SecretStorage access for this project, or why there is none. */
export function credentialDeps(context: HandlerContext, project: Project): AcoCredentialDeps | string {
    const adobe = project.adobe;
    if (!adobe?.organization || !adobe.projectId || !adobe.workspace) return NO_ADOBE;
    const secrets = context.context?.secrets;
    if (!secrets) return NO_SECRETS;
    const { organization, projectId, workspace } = adobe;
    const authService = ServiceLocator.getAuthenticationService();
    return {
        listOrgServices: () => createApiSubscriberClient(authService).getServicesForOrg(organization),
        setAcoApis: (codes) => reconcileExtras(context, project, codes, ACO_ADDON_ID),
        readCredential: async () => {
            const s2s = await (await authService.getEntityServices()).credentials.getS2SDeployCredentials(organization, projectId, workspace);
            return { clientId: s2s.clientId, clientSecret: s2s.clientSecret };
        },
        secrets,
        projectPath: project.path,
    };
}

/** `setUpAcoCredential`: add the ACO ingestion API to the workspace credential and keep its pair. */
export const handleSetUpAcoCredential: MessageHandler = async (context) => {
    const loaded = await loadProjectAndGuard(context);
    if (loaded.refusal) return loaded.refusal;
    const deps = credentialDeps(context, loaded.project);
    if (typeof deps === 'string') return { success: false, error: deps };
    const result = await setUpAcoCredential(deps);
    if (result.success) context.logger.info(`[ACO] Credential set up: ${result.apiCode} on the workspace credential`);
    return result;
};

/** `removeAcoCredential`: take the API off the credential and forget the pair; refused while ACO packs are loaded. */
export const handleRemoveAcoCredential: MessageHandler = async (context) => {
    const loaded = await loadProjectAndGuard(context);
    if (loaded.refusal) return loaded.refusal;
    const deps = credentialDeps(context, loaded.project);
    if (typeof deps === 'string') return { success: false, error: deps };
    const result = await removeAcoCredential(deps, await loadedAcoPacks(loaded.project));
    if (result.success) context.logger.info('[ACO] Credential removed from the project');
    return result;
};

/** Whether this project may have ACO: its stack offers it and its package allows it. */
export function projectAcoOffer(project: Project): AddonOffer {
    const stack = project.selectedStack ? getStackById(project.selectedStack) : undefined;
    return addonOffer(ACO_ADDON_ID, stack, resolveStorefrontForProject(project)?.package);
}

/** The ACO packs Demo Builder loaded into this project's instance and has not removed. */
async function loadedAcoPacks(project: Project): Promise<string[]> {
    const records = await readProjectRecords(nodeRecordFiles, project.path);
    return records.filter((record) => record.aco).map((record) => `${record.pack.name}@${record.pack.version}`);
}

/** How turning ACO on or off went. */
export type AcoAddonChange = { success: true } | { success: false; error: string; code?: ErrorCode };

/**
 * Turn the ACO add-on on or off for a saved project (Configure's save, PL-60): on sets up the
 * credential in the project's workspace first and keeps the add-on only if that worked; off
 * removes the credential first (refused while an ACO pack is loaded) and drops the add-on only if
 * that worked. Changes `project.selectedAddons` in place; the caller saves the project, and the
 * storefront's staleness check then sees ACO's settings come or go (republish prompt).
 */
export async function applyAcoAddonChange(context: HandlerContext, project: Project, on: boolean): Promise<AcoAddonChange> {
    if (on === usesAco(project)) return { success: true };
    const offer = projectAcoOffer(project);
    if (on && offer === 'not-offered') return { success: false, error: "This project's demo package does not offer Adobe Commerce Optimizer." };
    if (!on && offer === 'required') return { success: false, error: "This project's demo package requires Adobe Commerce Optimizer." };
    const guard = await runGuards(context, project);
    if (guard) return { success: false, error: guard.error, code: guard.code };
    const deps = credentialDeps(context, project);
    if (typeof deps === 'string') return { success: false, error: deps };
    const result = on ? await setUpAcoCredential(deps) : await removeAcoCredential(deps, await loadedAcoPacks(project));
    if (!result.success) return result;
    const others = (project.selectedAddons ?? []).filter((id) => id !== ACO_ADDON_ID);
    project.selectedAddons = on ? [...others, ACO_ADDON_ID] : others;
    context.logger.info(`[ACO] Turned ${on ? 'on' : 'off'} for ${project.name}`);
    return { success: true };
}
