/**
 * AdobeConsoleWorkspaceOps — Console workspace mutations.
 *
 * Owns creating and deleting a workspace inside a Console project, and giving a
 * workspace the Adobe I/O Runtime namespace Adobe provisions for none. SDK-only —
 * none of these have a CLI fallback. Project create, rename and delete live in
 * `adobeConsoleProjectOps.ts`; its Runtime sweep calls
 * `ensureWorkspaceRuntimeNamespace` here, wired by `createEntityCollaborators`.
 *
 * Listing a project's workspaces (to pick a free name, and to look again after a
 * failed delete) is NOT this class's job — the injected `listWorkspaces` does it,
 * wired to `AdobeWorkspaceReads.fetchWorkspaces`.
 *
 * Split from `adobeConsoleProjectOps.ts` by job (EDS-8, 2026-10-09).
 *
 * @module features/authentication/services/adobeConsoleWorkspaceOps
 */

import { deriveFreeAdobeEntityName, toAdobeTitle } from './adobeEntityName';
import { ensureSDKReady } from './adobeEntityReads';
import type { AdobeSDKClient } from './adobeSDKClient';
import type { AuthCacheManager } from './authCacheManager';
import { explainMissingDeveloperAccess } from './authenticationErrorFormatter';
import { DeletedWorkspaceNames } from './deletedWorkspaceNames';
import type { AdobeWorkspace, ConsoleOpFailure, RawAdobeWorkspace, SDKResponse } from './types';
import { getLogger } from '@/core/logging/debugLogger';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';


/** How many times a failed workspace delete looks again before believing it. */
const WORKSPACE_DELETE_LOOKS = 5;

/** Adobe's answer when a workspace name is already in use. */
function isNameClash(error: Error): boolean {
    const message = error.message || '';
    return message.includes('409') || message.includes('Conflict');
}

/**
 * Creates and deletes Console workspaces, and provisions their Runtime namespace.
 */
export class AdobeConsoleWorkspaceOps {
    private debugLogger = getLogger();

    constructor(
        private sdkClient: AdobeSDKClient,
        private cacheManager: AuthCacheManager,
        /** Lists a project's workspaces (the wiring hands in the reads' fetch). */
        private listWorkspaces: (orgId: string, projectId: string) => Promise<AdobeWorkspace[]>,
        /** Names deleted recently, which a new workspace must not take yet. */
        private deletedNames: DeletedWorkspaceNames = new DeletedWorkspaceNames(),
    ) {}

    /**
     * Provision an Adobe I/O Runtime namespace on one workspace, idempotently.
     *
     * `createRuntimeNamespace` POSTs the workspace's namespace endpoint. A workspace
     * that already has one (the template Production workspace, or a re-run) returns a
     * 409 — treated as success, not an error. Any other failure is logged, never
     * thrown (best-effort; the deploy-time pre-flight is the net).
     *
     * @param orgId - Organization AMS id.
     * @param projectId - Project id.
     * @param workspaceId - Workspace id to provision Runtime on.
     */
    async ensureWorkspaceRuntimeNamespace(
        orgId: string,
        projectId: string,
        workspaceId: string,
    ): Promise<void> {
        try {
            const client = this.sdkClient.getClient() as {
                createRuntimeNamespace: (
                    orgId: string,
                    projectId: string,
                    workspaceId: string
                ) => Promise<SDKResponse<unknown>>;
            };
            await client.createRuntimeNamespace(orgId, projectId, workspaceId);
            this.debugLogger.info(
                `[Entity Fetcher] Ensured Adobe I/O Runtime namespace for workspace ${workspaceId}`,
            );
        } catch (error) {
            const message = (error as Error).message || '';
            // Already provisioned (template Production ws, or a re-run) → not an error.
            if (/409|conflict|already\s*exist/i.test(message)) {
                this.debugLogger.debug(
                    `[Entity Fetcher] Runtime namespace already present for workspace ${workspaceId}`,
                );
                return;
            }
            this.debugLogger.warn(
                `[Entity Fetcher] Could not ensure Runtime namespace for workspace ${workspaceId}: ${message}`,
            );
        }
    }

    /**
     * Create a new workspace in the current organization's selected project.
     *
     * Uses the Console SDK's `createWorkspace`. Needs an org id AND a project id,
     * from `target` or else the cache. SDK-only (no CLI fallback). Never throws —
     * returns the mapped workspace, or a {@link ConsoleOpFailure} on validation
     * failure, missing org/project, unavailable SDK, or any SDK error (403
     * permission / 409 name-taken / quota), which the handler surfaces to the user.
     */
    async createWorkspace(
        title: string,
        description: string,
        target?: { orgId?: string; projectId?: string },
    ): Promise<AdobeWorkspace | ConsoleOpFailure> {
        // Input validation — enforce constraints regardless of caller.
        if (!title || title.length > 200) {
            this.debugLogger.error(
                '[Entity Fetcher] Invalid workspace title (empty or >200 chars)',
            );
            return { error: 'Workspace title must be 1–200 characters.' };
        }
        if (description.length > 500) {
            this.debugLogger.error('[Entity Fetcher] Invalid workspace description (>500 chars)');
            return { error: 'Workspace description must be at most 500 characters.' };
        }

        try {
            await ensureSDKReady(this.sdkClient);

            // Explicit target wins over the cache — same reason as createProject:
            // the agent's selection lives in `adobeTargetStore`, which never
            // reaches this cache, so a cached project could be a different one.
            const orgId = target?.orgId ?? this.cacheManager.getCachedOrganization()?.id;
            const projectId = target?.projectId ?? this.cacheManager.getCachedProject()?.id;
            if (!orgId || !projectId) {
                this.debugLogger.debug(
                    '[Entity Fetcher] Cannot create workspace: missing org or project ID',
                );
                return { error: 'No organization or project selected.' };
            }

            if (!this.sdkClient.isInitialized()) {
                this.debugLogger.debug('[Entity Fetcher] SDK not available for workspace creation');
                return { error: 'Console SDK is not available — sign in to Adobe first.' };
            }

            const client = this.sdkClient.getClient() as {
                createWorkspace: (
                    orgId: string,
                    projectId: string,
                    details: {
                        name: string;
                        title: string;
                        description: string;
                    }
                ) => Promise<SDKResponse<RawAdobeWorkspace>>;
            };

            // Console's workspace boxes SHOW the name, so it is the title's letters and
            // digits — "Northwind ERP" → `NorthwindERP` (no dash: the deploy service
            // refuses a dashed namespace) — numbered `NorthwindERP1` when it is taken.
            // A clash the list could not show gets one retry with a random ending. A
            // name deleted minutes ago is taken too: its Runtime namespace is still
            // being torn down (`deletedWorkspaceNames`).
            const taken = await this.listWorkspaces(orgId, projectId).then(
                (all) => [...all.map((w) => w.name), ...this.deletedNames.resting(projectId)],
                () => undefined,
            );
            let name = deriveFreeAdobeEntityName(title, taken);
            const consoleTitle = toAdobeTitle(title);
            const send = () => {
                this.debugLogger.info(
                    `[Entity Fetcher] Creating workspace "${consoleTitle}" (name: ${name}) in project ${projectId}`,
                );
                return client.createWorkspace(orgId, projectId, { name, title: consoleTitle, description });
            };
            const response = await send().catch((error: Error) => {
                if (!isNameClash(error) || !taken) throw error;
                name = deriveFreeAdobeEntityName(title, undefined);
                return send();
            });

            // The create endpoint returns only the new id ({ workspaceId }), NOT a full
            // workspace — so construct the workspace from that id + the details we sent.
            const raw = response?.body as { id?: string; workspaceId?: string } | undefined;
            const workspaceId = raw?.id ?? raw?.workspaceId;
            if (!workspaceId) {
                this.debugLogger.error(
                    '[Entity Fetcher] Workspace created but no workspaceId in response',
                );
                return { error: 'Console accepted the create but returned no workspace id.' };
            }

            this.debugLogger.info('[Entity Fetcher] Workspace created successfully');

            // A user-added workspace also needs a Runtime namespace for App Builder
            // app deploys — createWorkspace alone doesn't provision one.
            await this.ensureWorkspaceRuntimeNamespace(orgId, projectId, workspaceId);

            return { id: workspaceId, name, title: consoleTitle };
        } catch (error) {
            const message = (error as Error).message || '';
            if (isNameClash(error as Error)) {
                this.debugLogger.error('[Entity Fetcher] Workspace name already exists (409)');
                return { error: 'A workspace with this name already exists in the project (409).' };
            }
            this.debugLogger.error('[Entity Fetcher] Failed to create workspace', error as Error);
            return { error: message || 'Console rejected the workspace with no error message.' };
        }
    }

    /**
     * Delete a workspace from the selected project.
     *
     * THE REVERSAL OF `createWorkspace`, and it is shaped like it deliberately: same
     * target resolution, same "never throws, returns a failure the caller can show"
     * contract. `AdobeConsoleProjectOps.deleteConsoleProject` throws instead, because
     * its caller is a multi-step teardown that maps SDK errors itself; this one answers
     * a single tool call.
     *
     * No workspace name is protected: deleting the Production workspace of a real
     * project answered HTTP 200 in 3 seconds and took its Runtime namespace with it
     * (measured 2026-09-20). This used to claim Adobe refused that, which was never
     * true and was never tested. Whatever Adobe does refuse arrives as an SDK error
     * and is surfaced verbatim rather than pre-empted with a guess.
     */
    async deleteWorkspace(
        workspaceId: string,
        target?: {
            orgId?: string;
            projectId?: string;
            /** Its name, held back from new workspaces while Adobe finishes the delete. */
            workspaceName?: string;
        },
    ): Promise<{ deleted: true; note?: string } | ConsoleOpFailure> {
        if (!workspaceId) {
            return { error: 'A workspace id is required.' };
        }

        // Explicit target wins over the cache — same reason as createWorkspace: an
        // agent's selection lives in `adobeTargetStore`, which never reaches this cache.
        const orgId = target?.orgId ?? this.cacheManager.getCachedOrganization()?.id;
        const projectId = target?.projectId ?? this.cacheManager.getCachedProject()?.id;
        try {
            await ensureSDKReady(this.sdkClient);
            if (!orgId || !projectId) {
                return { error: 'No organization or project selected.' };
            }

            if (!this.sdkClient.isInitialized()) {
                return { error: 'Console SDK is not available — sign in to Adobe first.' };
            }

            const client = this.sdkClient.getClient() as {
                deleteWorkspace: (
                    orgId: string,
                    projectId: string,
                    workspaceId: string
                ) => Promise<unknown>;
            };

            this.debugLogger.info(
                `[Entity Fetcher] Deleting workspace ${workspaceId} from project ${projectId}`,
            );
            await client.deleteWorkspace(orgId, projectId, workspaceId);
            this.debugLogger.info('[Entity Fetcher] Workspace deleted successfully');
            await this.deletedNames.remember(projectId, target?.workspaceName);
            return { deleted: true };
        } catch (error) {
            const message = (error as Error).message || '';
            this.debugLogger.error('[Entity Fetcher] Failed to delete workspace', error as Error);
            // An error is not proof the delete failed: on 2026-09-21 Adobe's gateway
            // answered 504 and the workspace was gone a minute later. Look before
            // reporting a failure the SC would then act on.
            if (orgId && projectId && (await this.workspaceGone(orgId, projectId, workspaceId))) {
                this.debugLogger.info('[Entity Fetcher] The workspace is gone despite the error');
                await this.deletedNames.remember(projectId, target?.workspaceName);
                return {
                    deleted: true,
                    note: 'Adobe answered with an error, but the workspace is no longer in the project.',
                };
            }
            // A refusal for missing developer access (a read-only project, AB-18) gets
            // its cause in plain words; Adobe's own are in the error logged above.
            return {
                error:
                    explainMissingDeveloperAccess(message) ??
                    (message || 'Console rejected the delete with no error message.'),
            };
        }
    }

    /**
     * Whether a project's workspace list stops holding this id, looking a few times
     * over about a minute: the delete can finish after the error arrives. False when
     * it is still there at the last look, or the list cannot be read.
     */
    private async workspaceGone(orgId: string, projectId: string, workspaceId: string): Promise<boolean> {
        for (let look = 1; look <= WORKSPACE_DELETE_LOOKS; look++) {
            try {
                const workspaces = await this.listWorkspaces(orgId, projectId);
                if (!workspaces.some((workspace) => workspace.id === workspaceId)) return true;
            } catch {
                return false;
            }
            if (look < WORKSPACE_DELETE_LOOKS) await sleep(TIMEOUTS.WORKSPACE_DELETE_RECHECK);
        }
        return false;
    }
}
