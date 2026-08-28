/**
 * AdobeConsoleProjectOps — Console project and workspace mutations.
 *
 * Owns creating, renaming, and deleting Console projects and workspaces,
 * including the App Builder template-parity work a bare `createFireflyProject`
 * leaves undone: the Stage workspace, and a Runtime namespace on every
 * workspace. SDK-only — none of these have a CLI fallback.
 *
 * Listing a fresh project's workspaces (for the Runtime sweep) is NOT this
 * class's job — the injected `listWorkspaces` does it, wired by the facade to
 * `AdobeEntityReads.fetchWorkspaces`. Injecting the function rather than the
 * reads object keeps the dependency one-way and exactly as wide as the need.
 *
 * Extracted from `adobeEntityFetcher.ts` (god-file decomposition, 2026-08-23).
 *
 * @module features/authentication/services/adobeConsoleProjectOps
 */

import { deriveAdobeEntityName } from './adobeEntityName';
import type { AdobeSDKClient } from './adobeSDKClient';
import type { AuthCacheManager } from './authCacheManager';
import type {
    AdobeProject,
    AdobeWorkspace,
    ConsoleOpFailure,
    RawAdobeProject,
    RawAdobeWorkspace,
    SDKResponse,
} from './types';
import { getLogger } from '@/core/logging';

/**
 * Creates, renames, and deletes Console projects and workspaces.
 */
export class AdobeConsoleProjectOps {
    private debugLogger = getLogger();

    constructor(
        private sdkClient: AdobeSDKClient,
        private cacheManager: AuthCacheManager,
        /** Lists a project's workspaces (the facade wires in the reads' fetch). */
        private listWorkspaces: (orgId: string, projectId: string) => Promise<AdobeWorkspace[]>,
    ) {}

    /**
     * Ensure SDK is initialized (lazy init pattern)
     */
    private async ensureSDKReady(): Promise<void> {
        if (!this.sdkClient.isInitialized()) {
            await this.sdkClient.ensureInitialized();
        }
    }

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
            await this.ensureSDKReady();

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
            this.debugLogger.info(
                `[Entity Fetcher] Creating App Builder project "${title}" (name: ${name}) in org ${orgId}`,
            );

            const response = await client.createFireflyProject(orgId, {
                name,
                title,
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

            // createFireflyProject provisions ONLY the default Production workspace. The
            // Console's "Project from template → App Builder" flow also creates Stage, and
            // there is NO public API to provision both in one call (aio-lib-console exposes
            // createWorkspace only as a separate operation). Mirror the template so our
            // projects match. Best-effort: a Stage failure leaves the valid Production-only
            // project rather than failing the whole create.
            await this.createDefaultStageWorkspace(orgId, projectId);

            // Every workspace must ship a Runtime namespace so App Builder apps can
            // deploy to it (the added Stage workspace doesn't get one automatically).
            await this.ensureProjectWorkspacesHaveRuntime(orgId, projectId);

            return {
                id: projectId,
                name,
                title,
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
     * rename. Org/project ids come from the demo's persisted `adobe` config,
     * not from the SDK's ambient selection: a wrong-org token gets a 403 from
     * the API, which is the org guard a best-effort cosmetic sync needs —
     * callers get `false` and move on, never an exception.
     *
     * @param orgId - Organization id from `project.adobe.organization`
     * @param projectId - Project id from `project.adobe.projectId`
     * @param title - The new human-readable title
     * @returns true when the remote title was updated; false on any refusal
     */
    async renameRemoteProject(orgId: string, projectId: string, title: string): Promise<boolean> {
        try {
            if (!this.sdkClient.isInitialized()) {
                this.debugLogger.debug('[Entity Fetcher] SDK not available for project rename');
                return false;
            }

            const client = this.sdkClient.getClient() as {
                editProject: (
                    orgId: string,
                    projectId: string,
                    details: { title: string }
                ) => Promise<unknown>;
            };

            await client.editProject(orgId, projectId, { title });
            this.debugLogger.info(
                `[Entity Fetcher] Renamed remote project ${projectId} title to "${title}"`,
            );
            return true;
        } catch (error) {
            this.debugLogger.warn(
                `[Entity Fetcher] Remote project rename refused: ${error instanceof Error ? error.message : String(error)}`,
            );
            return false;
        }
    }

    /**
     * Create the "Stage" workspace to mirror the App Builder template.
     *
     * createFireflyProject provisions only the default Production workspace; the Console's
     * templated App Builder create additionally makes Stage. There is no public API to
     * provision both at once, so we add Stage explicitly. Named exactly "Stage" (NOT the
     * suffix-derived name) to match the convention the workspace picker auto-selects on and
     * downstream tooling expects. Best-effort — never throws; a failure just leaves the
     * project with Production only.
     */
    private async createDefaultStageWorkspace(orgId: string, projectId: string): Promise<void> {
        try {
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
            await client.createWorkspace(orgId, projectId, {
                name: 'Stage',
                title: 'Stage',
                description: '',
            });
            this.debugLogger.info(
                '[Entity Fetcher] Created Stage workspace (App Builder template parity)',
            );
        } catch (error) {
            this.debugLogger.warn(
                '[Entity Fetcher] Could not create the Stage workspace; project has Production only: ' +
                    `${(error as Error).message}`,
            );
        }
    }

    /**
     * Ensure EVERY workspace in a freshly-created project has an Adobe I/O Runtime
     * namespace.
     *
     * The App Builder (jaeger) template provisions Runtime for the default
     * Production workspace, but a workspace added via `createWorkspace` (our Stage —
     * the one the picker auto-selects and deploys to) does NOT get one — so an App
     * Builder app deployed there fails with "no Runtime namespace" (a mesh doesn't,
     * masking it). Provision it explicitly. Best-effort: a failure logs and leaves
     * the deploy-time pre-flight as the safety net.
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
                    await this.ensureWorkspaceRuntimeNamespace(orgId, projectId, workspace.id);
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
     * Uses the Console SDK's `createWorkspace`. Needs the cached org id AND
     * project id. SDK-only (no CLI fallback). Never throws — returns the mapped
     * workspace, or `undefined` on validation failure, missing org/project,
     * unavailable SDK, or any SDK error (403 permission / 409 name-taken /
     * quota), which the handler surfaces to the user.
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
            await this.ensureSDKReady();

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

            // Adobe validates the machine `name` as alphanumeric-only; derive it from the
            // free-form title (the user's input). The title stays human-readable in the UI.
            const name = deriveAdobeEntityName(title);
            this.debugLogger.info(
                `[Entity Fetcher] Creating workspace "${title}" (name: ${name}) in project ${projectId}`,
            );

            const response = await client.createWorkspace(orgId, projectId, {
                name,
                title,
                description,
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

            return { id: workspaceId, name, title };
        } catch (error) {
            const message = (error as Error).message || '';
            if (message.includes('409') || message.includes('Conflict')) {
                this.debugLogger.error('[Entity Fetcher] Workspace name already exists (409)');
                return { error: 'A workspace with this name already exists in the project (409).' };
            }
            this.debugLogger.error('[Entity Fetcher] Failed to create workspace', error as Error);
            return { error: message || 'Console rejected the workspace with no error message.' };
        }
    }

    /**
     * Delete an Adobe Console project. SDK errors propagate UNCHANGED — the
     * teardown caller maps them (notably the 409 ERR_MSG_PROJECT_DELETE_FORBIDDEN
     * thrown while event providers are still attached to the project).
     */
    async deleteConsoleProject(orgId: string, projectId: string): Promise<void> {
        await this.ensureSDKReady();

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
