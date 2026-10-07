/**
 * An added ERP's own server-to-server credential (AB-16a).
 *
 * Each ERP added from the integration's card is deployed into a workspace of its own, and its
 * `require-adobe-auth` actions accept machine calls only from THAT workspace's technical
 * account. The integration's own credential is refused ("Technical account mismatch", Contoso
 * on Bodea, 2026-09-28), so the ERP's credential is read from its workspace and handed to the
 * integration with the ERP list (`erpListSync.ts`).
 *
 * The read is aimed at the ERP's workspace exactly as its deploy is (`targetFor` in the
 * runner): the project's org and Console project, the component's own workspace id.
 *
 * SECRET HYGIENE: the answer holds a live client secret. It is returned to the caller in
 * memory only; nothing here logs or writes it.
 *
 * @module features/app-builder/services/erpCredential
 */

import type { ErpAuth } from './erpList';
import { fetchWorkspaceS2SCredential } from './runtimeCredentials';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { buildOrgTargetFromProjectAdobe, withOrgContext, type CachedOrgRef } from '@/core/shell/orgContextEnv';
import { demoBuilderNode } from '@/features/components/services/nodeRequirements';
import type { AppBuilderComponentState, Project } from '@/types/base';

type Workspace = NonNullable<AppBuilderComponentState['workspace']>;

/** Reads one workspace's credential; throws with the reason it could not. */
export type ErpCredentialRead = (workspace: Workspace) => Promise<ErpAuth>;

/**
 * A reader of an ERP workspace's credential, for the list sync.
 *
 * @param commandManager - runs the `aio console workspace download`
 * @param project - the project, whose org and Console project the workspace is in
 * @param cachedOrg - the signed-in org, to target by code and name when it matches
 * @returns the reader
 */
export function erpCredentialReader(
    commandManager: CommandExecutor,
    project: Project,
    cachedOrg: CachedOrgRef | undefined,
): ErpCredentialRead {
    return async (workspace) => {
        const target = { ...buildOrgTargetFromProjectAdobe(project.adobe, cachedOrg), workspaceId: workspace.id };
        const credential = await withOrgContext(target, () => fetchWorkspaceS2SCredential(commandManager, demoBuilderNode()));
        if (!credential) {
            throw new Error(`the ${workspace.name} workspace has no OAuth server-to-server credential`);
        }
        return credential;
    };
}
