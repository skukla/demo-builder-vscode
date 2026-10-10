/**
 * AdobeConsoleProjectOps — Console project mutations.
 *
 * Owns creating, renaming, and deleting Console projects, including the one thing
 * a bare `createFireflyProject` leaves undone: a Runtime namespace, which Adobe
 * provisions for NO workspace. SDK-only — none of these have a CLI fallback.
 * Workspace create and delete live in `adobeConsoleWorkspaceOps.ts`.
 *
 * Listing a fresh project's workspaces, and provisioning one workspace's Runtime
 * namespace, are NOT this class's jobs — the injected `listWorkspaces` and
 * `ensureRuntimeNamespace` do them, wired by `createEntityCollaborators` to
 * `AdobeWorkspaceReads.fetchWorkspaces` and
 * `AdobeConsoleWorkspaceOps.ensureWorkspaceRuntimeNamespace`. Injecting the
 * functions rather than the objects keeps the dependency one-way and exactly as
 * wide as the need.
 *
 * Extracted from `adobeEntityFetcher.ts` (god-file decomposition, 2026-08-23);
 * the workspace half split out by job on 2026-10-09 (EDS-8).
 *
 * @module features/authentication/services/adobeConsoleProjectOps
 */

import { deriveAdobeEntityName, toAdobeTitle } from './adobeEntityName';
import { ensureSDKReady } from './adobeEntityReads';
import type { AdobeSDKClient } from './adobeSDKClient';
import type { AuthCacheManager } from './authCacheManager';
import type { AdobeProject, AdobeWorkspace, ConsoleOpFailure, RawAdobeProject, SDKResponse } from './types';
import { getLogger } from '@/core/logging/debugLogger';

/** What renaming an Adobe project answers: done, or Adobe's reason for refusing. */
export type RemoteRenameResult = { ok: true } | { ok: false; error: string };

/** Provisions one workspace's Runtime namespace; best-effort, never throws. */
export type EnsureRuntimeNamespace = (
    orgId: string,
    projectId: string,
    workspaceId: string,
) => Promise<void>;

/**
 * Creates, renames, and deletes Console projects.
 */
export class AdobeConsoleProjectOps {
    private debugLogger = getLogger();

    constructor(
        private sdkClient: AdobeSDKClient,
        private cacheManager: AuthCacheManager,
        /** Lists a project's workspaces (the wiring hands in the reads' fetch). */
        private listWorkspaces: (orgId: string, projectId: string) => Promise<AdobeWorkspace[]>,
        /** Gives one workspace its Runtime namespace (the workspace ops' own). */
        private ensureRuntimeNamespace: EnsureRuntimeNamespace,
    ) {}

    /**
     * Create a new Adobe I/O App Builder project in the current organization.
     *
     * Uses the Console SDK's `createFireflyProject` (project type 'jaeger' =
     * App Builder). Needs only the cached org id. SDK-only (no CLI fallback).
     * Never throws — returns the mapped project, or a {@link ConsoleOpFailure}
     * naming the REAL reason (validation, missing org, unavailable SDK, or the
     * SDK error's own text), which callers surface verbatim.
     */
    async createProject(
        title: string,
        description: string,
        target?: { orgId?: string },
    ): Promise<AdobeProject | ConsoleOpFailure> {
        // Input validation — enforce constraints regardless of caller.
        if (!title || title.length > 200) {
            this.debugLogger.error('[Entity Fetcher] Invalid project title (empty or >200 chars)');
            return { error: 'Project title must be 1–200 characters.' };
        }
        if (description.length > 500) {
            this.debugLogger.error('[Entity Fetcher] Invalid project description (>500 chars)');
            return { error: 'Project description must be at most 500 characters.' };
        }

        try {
            await ensureSDKReady(this.sdkClient);

            // An explicit target overrides the cache. The cache is the UI's
            // selection; the agent surface has its own (`adobeTargetStore`), and
            // `select_org` does not write the cache — so without this a tool would
            // create in whatever the UI last selected. See ADR/plan defect 0a.
            const orgId = target?.orgId ?? this.cacheManager.getCachedOrganization()?.id;
            if (!orgId) {
                this.debugLogger.debug('[Entity Fetcher] Cannot create project: missing org ID');
                return { error: 'No organization selected.' };
            }

            if (!this.sdkClient.isInitialized()) {
                this.debugLogger.debug('[Entity Fetcher] SDK not available for project creation');
                return { error: 'Console SDK is not available — sign in to Adobe first.' };
            }

            // `who_created` is deliberately NOT sent. Adobe stamps it with the calling
            // token's IMS user id and discards whatever we pass — which is what makes
            // `verifyProjectOwnership` work at all: it compares the field to the current
            // user id, so a literal like 'Demo Builder' would make every project we
            // create undeletable. Sending it only implies we control a delete gate we
            // do not. (`who_created` is optional in aio-lib-console's ProjectDetails.)
            const client = this.sdkClient.getClient() as {
                createFireflyProject: (
                    orgId: string,
                    details: {
                        name: string;
                        title: string;
                        description: string;
                    }
                ) => Promise<SDKResponse<RawAdobeProject>>;
            };

            // Adobe validates the machine `name` as alphanumeric-only; derive it from the
            // free-form title (the user's input). The title stays human-readable in the UI.
            const name = deriveAdobeEntityName(title);
            const consoleTitle = toAdobeTitle(title);
            this.debugLogger.info(
                `[Entity Fetcher] Creating App Builder project "${consoleTitle}" (name: ${name}) in org ${orgId}`,
            );

            const response = await client.createFireflyProject(orgId, {
                name,
                title: consoleTitle,
                description,
            });

            // The create endpoint returns only the new id ({ projectId }), NOT a full
            // project — so construct the AdobeProject from that id + the details we sent.
            const raw = response?.body as { id?: string; projectId?: string } | undefined;
            const projectId = raw?.id ?? raw?.projectId;
            if (!projectId) {
                this.debugLogger.error(
                    '[Entity Fetcher] Project created but no projectId in response',
                );
                return { error: 'Console accepted the create but returned no project id.' };
            }

            this.debugLogger.info('[Entity Fetcher] App Builder project created successfully');

            // A project gets exactly the one workspace Adobe creates. We used to add a
            // second, "Stage", to mirror the Console's template flow — and then used that
            // one and left Adobe's empty. Removed 2026-09-20 (AB-24): it was a workspace
            // for its own sake, its best-effort create gave "which workspace is this
            // project's?" two possible answers, and under workspace-per-add every other
            // workspace belongs to something.
            //
            // The namespace is NOT optional and NOT free: Adobe provisions one for no
            // workspace at all, Production included (measured 2026-09-20 — zero namespaces
            // at 0s, 15s, 30s and 60s).
            await this.ensureProjectWorkspacesHaveRuntime(orgId, projectId);

            return {
                id: projectId,
                name,
                title: consoleTitle,
                description: description || undefined,
                org_id: orgId,
            };
        } catch (error) {
            const message = (error as Error).message || '';
            if (message.includes('409') || message.includes('Conflict')) {
                this.debugLogger.error('[Entity Fetcher] Project name already exists (409)');
                return { error: 'A project with this name already exists in the org (409).' };
            }
            this.debugLogger.error('[Entity Fetcher] Failed to create project', error as Error);
            // The SDK's own text IS the answer — a Console 400 names the exact
            // rule ("Project name length must be less than 20"), and dropping
            // it here is what forced a live bisection to rediscover it.
            return { error: message || 'Console rejected the project with no error message.' };
        }
    }

    /**
     * Sync a remote Adobe I/O project's TITLE to a renamed demo (best-effort).
     *
     * `editProject` is a PATCH (aio-lib-console
     * `patch_console_organizations__orgId__projects__projectId_`), so
     * `{ title }` alone is the deliberate payload — the machine `name` (part
     * of the project's identity) and description are never touched by a
     * rename. Org/project ids come from the caller, never from the SDK's ambient
     * selection: a wrong-org token gets a 403 from the API. Never throws — a
     * refusal comes back with Adobe's own words, so an explicit rename can say why
     * (translated for the SC by the caller) and a best-effort sync can just move on.
     *
     * @param orgId - Organization id
     * @param projectId - Project id
     * @param title - The new human-readable title
     * @returns `{ ok: true }` when the remote title was updated, else why not
     */
    async renameRemoteProject(orgId: string, projectId: string, title: string): Promise<RemoteRenameResult> {
        try {
            if (!this.sdkClient.isInitialized()) {
                this.debugLogger.debug('[Entity Fetcher] SDK not available for project rename');
                return { ok: false, error: 'The Adobe Console SDK is not available.' };
            }

            const client = this.sdkClient.getClient() as {
                editProject: (
                    orgId: string,
                    projectId: string,
                    details: { title: string }
                ) => Promise<unknown>;
            };

            await client.editProject(orgId, projectId, { title: toAdobeTitle(title) });
            this.debugLogger.info(
                `[Entity Fetcher] Renamed remote project ${projectId} title to "${toAdobeTitle(title)}"`,
            );
            return { ok: true };
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            this.debugLogger.warn(`[Entity Fetcher] Remote project rename refused: ${reason}`);
            return { ok: false, error: reason };
        }
    }

    /**
     * Ensure EVERY workspace in a freshly-created project has an Adobe I/O Runtime
     * namespace.
     *
     * NO workspace gets one on its own — not the one added via `createWorkspace`, and
     * not the Production workspace Adobe creates. Measured 2026-09-20 on a fresh
     * project: `runtime` is present with ZERO namespaces at 0s, 15s, 30s and 60s, and
     * `createRuntimeNamespace` fills it immediately. So this is not propagation, and
     * this sweep is the ONLY thing that provisions Runtime for a project we create.
     *
     * This used to say the App Builder (jaeger) template provisioned Production and
     * only our added workspace missed out. That was never true and never tested, and
     * it is the kind of claim that gets a loop deleted as redundant.
     *
     * It matters because an App Builder app deployed to a workspace with no namespace
     * fails (a mesh does not, masking it) — the likeliest cause of the AB-2 spike's
     * `aio app deploy` failing on a fresh workspace with "Cannot read properties of
     * undefined 'runtime'". Best-effort: a failure logs and leaves the deploy-time
     * pre-flight as the safety net.
     *
     * @param orgId - Organization AMS id.
     * @param projectId - The just-created project's id.
     */
    private async ensureProjectWorkspacesHaveRuntime(
        orgId: string,
        projectId: string,
    ): Promise<void> {
        try {
            const workspaces = await this.listWorkspaces(orgId, projectId);
            for (const workspace of workspaces) {
                if (workspace.id) {
                    await this.ensureRuntimeNamespace(orgId, projectId, workspace.id);
                }
            }
        } catch (error) {
            // Best-effort: a listing failure must not fail the project create (the
            // deploy-time pre-flight still catches a missing namespace).
            this.debugLogger.warn(
                `[Entity Fetcher] Could not ensure Runtime namespaces for project ${projectId}: ` +
                    `${(error as Error).message}`,
            );
        }
    }

    /**
     * Delete an Adobe Console project. SDK errors propagate UNCHANGED — the
     * teardown caller maps them (notably the 409 ERR_MSG_PROJECT_DELETE_FORBIDDEN
     * thrown while event providers are still attached to the project).
     */
    async deleteConsoleProject(orgId: string, projectId: string): Promise<void> {
        await ensureSDKReady(this.sdkClient);

        if (!orgId || !projectId) {
            throw new Error('deleteConsoleProject: orgId and projectId are required');
        }
        if (!this.sdkClient.isInitialized()) {
            throw new Error('deleteConsoleProject: Adobe Console SDK is not initialized');
        }

        const client = this.sdkClient.getClient() as {
            deleteProject: (orgId: string, projectId: string) => Promise<unknown>;
        };
        await client.deleteProject(orgId, projectId);
    }
}
