/**
 * Console-project teardown orchestrator.
 *
 * Deletes an Adobe Developer Console project after removing the event
 * registrations and 3rd-party event providers that would otherwise make the
 * delete fail with an opaque 409 (spike-validated:
 * .rptc/research/delete-aio-project/research.md "Spike close (2026-07-03)").
 *
 * Design decisions (locked in the approved plan):
 * - Single org-wide provider discovery pass, keyed off each provider's
 *   `rel:update` href binding; run with the FIRST usable workspace credential.
 * - Subscribe-on-403: an unsubscribed credential is subscribed to the I/O
 *   Management API and the call retried on a fixed propagation schedule.
 * - Escalation-create only for provider-bearing credential-less workspaces;
 *   credential-less workspaces without providers are skipped fast (no
 *   credential ⇒ no providers can exist).
 * - Collect-don't-throw per entity; abort BEFORE the project delete when any
 *   entity failed (pre-emptive — the Console 409 never names the blocker).
 * - Of Adobe's THREE documented delete blockers only the event one is
 *   pre-emptable from here; the other two are named in the failure message
 *   instead (see UNPREEMPTED_DELETE_BLOCKERS).
 * - `shouldClearConsoleSelection` signals the HANDLER to clear the aio
 *   console selection; this module never touches local state itself.
 *
 * Step-3 internals (access recovery, discovery, escalation, per-workspace
 * deletion) live in `consoleProjectTeardownEvents.ts`.
 */

import { errorMessage, teardownEventEntities } from './consoleProjectTeardownEvents';
import type { EventsAuth, IoEventsClient } from './ioEventsClient';
import type { WorkspaceS2SCredentialIds } from './types';
import { getLogger } from '@/core/logging/debugLogger';

/** Progress steps reported to `onProgress`. */
const TOTAL_STEPS = 4;

// ==========================================================
// Public types
// ==========================================================

/**
 * The subset of {@link IoEventsClient} teardown uses. A `Pick` of the class's
 * public methods so real instances satisfy it while tests can supply plain
 * objects (the class has private fields, which object literals cannot match).
 */
export type TeardownEventsClient = Pick<
    IoEventsClient,
    'listProviders' | 'listRegistrations' | 'deleteRegistration' | 'deleteProvider'
>;

/** A Console workspace, as listed for the target project. */
export interface ConsoleWorkspace {
    id: string;
    name: string;
}

/**
 * Narrow dependency surface (AuthenticationService subset + an events-client
 * factory). The handler builds the adapter; tests supply plain-object mocks —
 * same pattern as `apiSubscriber.ts`'s `ApiSubscriberClient`.
 */
export interface TeardownDeps {
    getWorkspaces(args: { orgId: string; projectId: string }): Promise<ConsoleWorkspace[]>;
    getWorkspaceS2SCredential(
        orgId: string,
        projectId: string,
        workspaceId: string
    ): Promise<WorkspaceS2SCredentialIds | undefined>;
    createWorkspaceS2SCredentialFor(
        orgId: string,
        projectId: string,
        workspaceId: string
    ): Promise<WorkspaceS2SCredentialIds>;
    /** Subscribe the credential to the baseline I/O Management API. */
    subscribeManagementApi(orgId: string, idIntegration: string): Promise<void>;
    deleteConsoleProject(orgId: string, projectId: string): Promise<void>;
    /** IMS access token; throws when unavailable. */
    getAccessToken(): Promise<string>;
    /** Factory seam so tests can observe/mint per-credential clients. */
    createEventsClient(auth: EventsAuth): TeardownEventsClient;
}

/** The Console project to tear down. */
export interface TeardownTarget {
    orgId: string;
    projectId: string;
    projectTitle?: string;
}

/** Progress callback payload (human-readable, 1-based steps). */
export interface TeardownProgress {
    step: number;
    totalSteps: number;
    message: string;
}

/** Per-entity teardown outcome, collected (never thrown) as the flow runs. */
export interface TeardownItem {
    kind: 'registration' | 'provider' | 'workspace' | 'project';
    id: string;
    label?: string;
    workspaceName?: string;
    outcome: 'deleted' | 'skipped' | 'failed';
    error?: string;
}

/** Overall teardown result. */
export interface ConsoleProjectTeardownResult {
    success: boolean;
    projectDeleted: boolean;
    items: TeardownItem[];
    /**
     * True when the caller should clear the aio console selection (project
     * deleted) — the HANDLER decides and performs the conditional clear.
     */
    shouldClearConsoleSelection: boolean;
}

/** Shared state threaded through the teardown phases (internal). */
export interface TeardownContext {
    deps: TeardownDeps;
    target: TeardownTarget;
    items: TeardownItem[];
    accessToken: string;
    /** workspaceId → usable credential (falsy clientId is treated as absent). */
    credentials: Map<string, WorkspaceS2SCredentialIds>;
    workspaceNames: Map<string, string>;
}

// ==========================================================
// Internal helpers
// ==========================================================

function buildResult(items: TeardownItem[], projectDeleted: boolean): ConsoleProjectTeardownResult {
    return {
        success: projectDeleted,
        projectDeleted,
        shouldClearConsoleSelection: projectDeleted,
        items,
    };
}

/**
 * Step 1: resolve the access token and workspace list. Returns `undefined`
 * after collecting a failed item — the teardown then aborts with zero
 * further API calls.
 */
async function prepareTeardown(
    deps: TeardownDeps,
    target: TeardownTarget,
    items: TeardownItem[],
): Promise<{ accessToken: string; workspaces: ConsoleWorkspace[] } | undefined> {
    try {
        const accessToken = await deps.getAccessToken();
        const workspaces = await deps.getWorkspaces({
            orgId: target.orgId,
            projectId: target.projectId,
        });
        return { accessToken, workspaces };
    } catch (error) {
        items.push({
            kind: 'project',
            id: target.projectId,
            label: target.projectTitle,
            outcome: 'failed',
            error: `Could not prepare the teardown: ${errorMessage(error)}`,
        });
        return undefined;
    }
}

/** Step 2: detect-only credential scan; a scan failure counts as "no credential". */
async function scanWorkspaceCredentials(
    deps: TeardownDeps,
    target: TeardownTarget,
    workspaces: ConsoleWorkspace[],
): Promise<Map<string, WorkspaceS2SCredentialIds>> {
    const credentials = new Map<string, WorkspaceS2SCredentialIds>();
    for (const workspace of workspaces) {
        try {
            const credential = await deps.getWorkspaceS2SCredential(
                target.orgId,
                target.projectId,
                workspace.id,
            );
            if (credential?.clientId) {
                credentials.set(workspace.id, credential);
            }
        } catch {
            // Unreadable credential ⇒ same as absent; escalation covers it if needed.
        }
    }
    return credentials;
}

/** No usable credential anywhere ⇒ no providers can exist (spike-validated). */
function skipAllWorkspaces(items: TeardownItem[], workspaces: ConsoleWorkspace[]): void {
    for (const workspace of workspaces) {
        items.push({
            kind: 'workspace',
            id: workspace.id,
            workspaceName: workspace.name,
            outcome: 'skipped',
        });
    }
}

/**
 * The delete blockers this teardown cannot pre-empt, appended to a failed
 * project delete.
 *
 * Adobe documents three conditions that block a Console project delete. This
 * module clears the first before deleting; the other two are not detectable from
 * here — the Console SDK exposes no app-submission status (only
 * `getApplicationExtensions`, which needs an applicationId this flow never has),
 * and the shared-package check would need Runtime credentials per workspace that
 * teardown does not hold.
 *
 * So they cannot be prevented, only explained. Console's 409 never names its
 * cause, which is the failure mode this whole module exists to avoid; leaving the
 * bare message would hand the user a teardown that stopped for no stated reason.
 * The remedy for the published case is Adobe's own ("revoke a published app and
 * then delete the Project").
 *
 * @see https://developer.adobe.com/developer-console/docs/guides/projects/
 */
const UNPREEMPTED_DELETE_BLOCKERS =
    'Adobe does not say which condition blocked the delete. Two it could be, ' +
    'neither of which this teardown can check for you: an App Builder app ' +
    'submitted for approval (Pending or Published) — revoke the published app, ' +
    'then retry; or a workspace whose Runtime namespace exposes a shared package.';

/** The raw Console error, plus what it declines to tell you. */
function explainDeleteFailure(error: unknown): string {
    return `${errorMessage(error)} — ${UNPREEMPTED_DELETE_BLOCKERS}`;
}

/** Step 4: delete the Console project (only reached with zero failed items). */
async function deleteProject(
    deps: TeardownDeps,
    target: TeardownTarget,
    items: TeardownItem[],
): Promise<ConsoleProjectTeardownResult> {
    try {
        await deps.deleteConsoleProject(target.orgId, target.projectId);
        items.push({
            kind: 'project',
            id: target.projectId,
            label: target.projectTitle,
            outcome: 'deleted',
        });
        return buildResult(items, true);
    } catch (error) {
        items.push({
            kind: 'project',
            id: target.projectId,
            label: target.projectTitle,
            outcome: 'failed',
            error: explainDeleteFailure(error),
        });
        return buildResult(items, false);
    }
}

// ==========================================================
// Orchestrator
// ==========================================================

/**
 * Tear down a Console project: remove its event registrations and 3rd-party
 * providers, then delete the project. Per-entity failures are collected (not
 * thrown); any failure aborts BEFORE the project delete. Never throws.
 */
export async function teardownConsoleProject(
    deps: TeardownDeps,
    target: TeardownTarget,
    onProgress?: (progress: TeardownProgress) => void,
): Promise<ConsoleProjectTeardownResult> {
    const items: TeardownItem[] = [];
    // Phase-channel reporting reaches only a LIVE listener; these debug lines
    // are the durable record. Added after a headless hang was invisible in
    // Debug Logs precisely because this function logged nothing (AI-5).
    const debugLogger = getLogger();
    const report = (step: number, message: string): void => {
        debugLogger.debug(`[Teardown] step ${step}/${TOTAL_STEPS}: ${message}`);
        onProgress?.({ step, totalSteps: TOTAL_STEPS, message });
    };

    report(1, 'Finding workspaces…');
    const prep = await prepareTeardown(deps, target, items);
    if (!prep) {
        debugLogger.debug('[Teardown] preparation failed — aborting before any deletion');
        return buildResult(items, false);
    }
    debugLogger.debug(`[Teardown] found ${prep.workspaces.length} workspace(s)`);

    report(2, 'Checking workspace credentials…');
    const ctx: TeardownContext = {
        deps,
        target,
        items,
        accessToken: prep.accessToken,
        credentials: await scanWorkspaceCredentials(deps, target, prep.workspaces),
        workspaceNames: new Map(prep.workspaces.map((workspace) => [workspace.id, workspace.name])),
    };

    const firstCredential = ctx.credentials.values().next().value;
    debugLogger.debug(
        `[Teardown] ${ctx.credentials.size} workspace credential(s) found` +
            `${firstCredential ? '' : ' — skipping event-entity sweep'}`,
    );
    if (firstCredential) {
        report(3, 'Removing event registrations and providers…');
        // A failed sweep records a failed item, which the gate below aborts on.
        await teardownEventEntities(ctx, prep.workspaces, firstCredential);
    } else {
        // Keep the reported steps monotonic and complete even on the fast path.
        report(3, 'No event entities to remove');
        skipAllWorkspaces(items, prep.workspaces);
    }

    if (items.some((item) => item.outcome === 'failed')) {
        return buildResult(items, false);
    }
    report(4, 'Deleting Adobe project…');
    const result = await deleteProject(deps, target, items);
    debugLogger.debug(
        `[Teardown] done — projectDeleted=${result.projectDeleted}, ${result.items.length} item(s)`,
    );
    return result;
}
