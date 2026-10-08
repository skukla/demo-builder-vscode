/**
 * Console-free ACCS credential provisioning, as a panel handler.
 *
 * Split out of `importHandlers.ts` (decompose-god-file, 2026-10-08): it is the one
 * handler there that CREATES something in the user's Console workspace, and it
 * carries its own dependencies (the provisioner, the workspace download, the
 * secret migration) that no import or reset touches.
 *
 * Merged into `importHandlers` so the panel keeps one handler map to reach for.
 *
 * @module features/data-installer/handlers/provisionAccsHandler
 */

import { provisionAccsCredentials } from '../services/accsCredentialProvisioner';
import { canProvisionAccsCredentials } from '../services/accsProvisionEligibility';
import { downloadWorkspaceConfigJson } from '../services/workspaceConfigDownload';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { migrateDeclaredSecrets } from '@/features/components/services/commerceSecretMigration';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

export const provisionAccsHandlers = defineHandlers({
    /**
     * Console-free ACCS credential provisioning — the loop proven live
     * 2026-08-13, wired to THIS project's own Adobe binding.
     *
     * On success the pair lands in `componentConfigs['adobe-commerce-accs']` —
     * the DECLARED fields, exactly where a hand-pasted pair lives — and the
     * project is saved. One storage path, not two. The response never carries
     * the values; the next dry run reads them where everything else does.
     *
     * Panel-only by construction (never in the MCP maps): it creates a
     * credential in the user's Console workspace.
     */
    'provision-accs-credentials': async (context: HandlerContext): Promise<HandlerResponse> => {
        const project = await context.stateManager.getCurrentProject();
        if (!project) {
            return { success: false, error: 'Open a project first.', code: ErrorCode.PROJECT_NOT_FOUND };
        }
        if (project.componentSelections?.backend !== 'adobe-commerce-accs') {
            return {
                success: false,
                error: 'Automatic setup applies to ACCS backends only — PaaS uses the admin username and password.',
                code: ErrorCode.INVALID_OPERATION,
            };
        }
        const adobe = project.adobe;
        // Same predicate the OFFER uses. Kept shared so the button and the
        // guard behind it cannot disagree — they did, and the disagreement was
        // a button that could only ever refuse.
        if (!canProvisionAccsCredentials(adobe)) {
            return {
                success: false,
                error: 'This project has no Adobe project binding, so there is no workspace to provision in.',
                code: ErrorCode.INVALID_OPERATION,
            };
        }
        if (!context.authManager) {
            return { success: false, error: 'Adobe sign-in is required.', code: ErrorCode.AUTH_REQUIRED };
        }

        const executor = ServiceLocator.getCommandExecutor();
        const authManager = context.authManager;
        const units = () => authManager.getEntityServices();
        const result = await provisionAccsCredentials(
            {
                // Each call goes to the unit that owns it.
                auth: {
                    getWorkspaceS2SCredential: async (orgId, projectId, workspaceId) =>
                        (await units()).credentials.getWorkspaceS2SCredential(orgId, projectId, workspaceId),
                    createWorkspaceS2SCredentialFor: async (orgId, projectId, workspaceId) =>
                        (await units()).credentials.createWorkspaceS2SCredentialFor(
                            orgId,
                            projectId,
                            workspaceId,
                        ),
                    getSubscribedServiceCodes: async (orgId, idIntegration) =>
                        (await units()).orgServices.getSubscribedServiceCodes(orgId, idIntegration),
                    subscribeOAuthServerToServerIntegrationToServices: async (orgId, idIntegration, info) =>
                        (await units()).orgServices.subscribeOAuthServerToServerIntegrationToServices(
                            orgId,
                            idIntegration,
                            info,
                        ),
                },
                downloadWorkspaceJson: (target) => downloadWorkspaceConfigJson(executor, target),
                log: (line) => context.debugLogger.debug(`[Data Installer] provisioning: ${line}`),
            },
            { orgId: adobe.organization, projectId: adobe.projectId, workspaceId: adobe.workspace },
        );
        if (!result.ok) {
            return { success: false, error: result.reason, code: ErrorCode.UNKNOWN };
        }

        project.componentConfigs = project.componentConfigs ?? {};
        project.componentConfigs['adobe-commerce-accs'] = {
            ...project.componentConfigs['adobe-commerce-accs'],
            ACCS_OAUTH_CLIENT_ID: result.clientId,
            ACCS_OAUTH_CLIENT_SECRET: result.clientSecret,
        };

        // Route the freshly-provisioned secret to SecretStorage before the project
        // is saved. Without this the one path that CREATES a credential is the one
        // path that writes it to the manifest in the clear — the migration would
        // only clean it up on some later save, and until then a public-repo
        // manifest holds an org-wide Commerce write credential.
        const migration = await migrateDeclaredSecrets(
            project.componentConfigs,
            project.path,
            context.context?.secrets,
            (line: string) => context.debugLogger.debug(`[Data Installer] ${line}`),
        );
        project.componentConfigs = migration.sanitizedConfigs as typeof project.componentConfigs;

        await context.stateManager.saveProject(project);

        return { success: true };
    },
});
