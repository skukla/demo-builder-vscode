/**
 * The doors to the project's ACO ingestion credential (PL-60, owner 2026-10-31 P2): set it up when
 * ACO comes into the project, remove it when ACO leaves. The steps live in
 * `app-builder/services/acoCredential.ts`; these handlers fetch the services at the boundary and
 * run the App Builder guard chain first (auth, org match, Developer role), as every Console API
 * change does (`consoleApiHandlers.ts`).
 *
 * @module features/dashboard/handlers/acoCredentialHandlers
 */

import { loadProjectAndGuard, reconcileExtras } from './consoleApiHandlers';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { removeAcoCredential, setUpAcoCredential, type AcoCredentialDeps } from '@/features/app-builder/services/acoCredential';
import { createApiSubscriberClient } from '@/features/app-builder/services/apiSubscriberClientAdapter';
import { ACO_ADDON_ID } from '@/features/components/services/acoSettings';
import { nodeRecordFiles, readProjectRecords } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { Project } from '@/types/base';
import type { HandlerContext, MessageHandler } from '@/types/handlers';

const NO_ADOBE = 'This project has no Adobe project and workspace yet. Complete Adobe setup first.';
const NO_SECRETS = 'SecretStorage is not available here, so Demo Builder cannot keep the ACO credential.';

/** The steps' Adobe and SecretStorage access for this project, or why there is none. */
function credentialDeps(context: HandlerContext, project: Project): AcoCredentialDeps | string {
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
    const records = await readProjectRecords(nodeRecordFiles, loaded.project.path);
    const acoPacks = records.filter((record) => record.aco).map((record) => `${record.pack.name}@${record.pack.version}`);
    const result = await removeAcoCredential(deps, acoPacks);
    if (result.success) context.logger.info('[ACO] Credential removed from the project');
    return result;
};
