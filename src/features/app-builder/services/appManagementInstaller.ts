/**
 * App Management install orchestration — the wiring `appManagementClient`
 * shipped without.
 *
 * After an `app-management` lifecycle app deploys, it is DORMANT until its own
 * generated REST API is told to install and which Commerce instance it serves.
 * This module derives every input from what the project already knows —
 * no pickers, per the owner's decision (2026-08-27): the association target IS
 * the project's configured Commerce backend, and install is AUTOMATIC with a
 * hands-back to Commerce Admin when the call path fails.
 *
 * Input derivations (each measured, not assumed):
 * - Base URL: the `app-management` package's web-action URLs from
 *   `aio app get-url --json` (already persisted as `deployedUrls`), cut at the
 *   package segment — confirmed live 2026-08-27 (GET answered 401 at the
 *   predicted base).
 * - Commerce target: backend id → flavor (`adobe-commerce-accs` → `saas`,
 *   `adobe-commerce-paas` → `paas`); base URL = the backend's GraphQL endpoint
 *   with its trailing `/graphql` removed (the kit's own lib appends
 *   `rest/{storeView}/V1` for paas and `V1` for saas onto this base —
 *   aio-commerce-lib-api, read from source).
 * - `ioEventsUrl` / `ioEventsEnv`: the kit's lib defaults, read from ITS source
 *   (`DEFAULT_IO_EVENTS_BASE_URL = https://api.adobe.io/events`, IMS env
 *   default `prod`) — passed explicitly because the spec requires them.
 *
 * @module features/app-builder/services/appManagementInstaller
 */

import {
    AppManagementApiError,
    AppManagementClient,
    type AppData,
    type AppManagementAuth,
    type CommerceEnv,
    type InstallationState,
    type ReconcileResult,
} from './appManagementClient';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

/** The kit lib's own defaults (read from aio-commerce-lib-api source, 2026-08-27). */
const IO_EVENTS_URL = 'https://api.adobe.io/events';
const IO_EVENTS_ENV = 'prod';

/** How often to re-read a queued (202) installation's state. */
const POLL_INTERVAL_MS = 5000;
/** Give a queued installation this long before handing back to the user. */
const POLL_BUDGET_MS = TIMEOUTS.LONG;

/** Where the user finishes the job when the automatic path cannot. */
export const APP_MANAGEMENT_HANDS_BACK =
    'You can finish (or verify) the installation in Commerce Admin: Apps > App Management.';

/** The subset of {@link AppManagementClient} the installer drives (test seam). */
export type InstallerClient = Pick<
    AppManagementClient,
    'getInstallationState' | 'reconcileInstallation' | 'setAssociation'
>;

export interface AppManagementInstallResult {
    status: 'installed' | 'skipped' | 'failed';
    /** Human line — the no-op reason on skip, the hands-back on failure. */
    detail?: string;
}

export interface AppManagementInstallDeps {
    /** Resolve IMS auth for the app's org; undefined = cannot authenticate. */
    getAuth: () => Promise<AppManagementAuth | undefined>;
    logger: Logger;
    onProgress?: (message: string) => void;
    /** Client construction (tests inject a fake; default builds the real one). */
    clientFactory?: (baseUrl: string, auth: AppManagementAuth) => InstallerClient;
    /** Poll pacing (tests inject an instant resolver). */
    wait?: (ms: number) => Promise<void>;
}

/**
 * The App Management API base from the deployed action URLs: any URL containing
 * the reserved `app-management` package segment, cut just after it.
 *
 * @param deployedUrls - the per-action URL map `aio app get-url --json` yielded
 * @returns the base URL, or undefined when no app-management action deployed
 */
export function deriveAppManagementBaseUrl(
    deployedUrls: Record<string, string> | undefined,
): string | undefined {
    for (const url of Object.values(deployedUrls ?? {})) {
        const marker = url.indexOf('/app-management/');
        if (marker !== -1) {
            return url.slice(0, marker + '/app-management'.length);
        }
    }
    return undefined;
}

/** Backend component id → the App Management API's Commerce flavor. */
const BACKEND_FLAVOR: Record<string, CommerceEnv> = {
    'adobe-commerce-accs': 'saas',
    'adobe-commerce-paas': 'paas',
};

/**
 * The Commerce association target from the project's configured backend.
 *
 * The base URL is the backend's GraphQL endpoint with the trailing `/graphql`
 * stripped: for paas that recovers the instance root, for saas (ACCS) the
 * tenant API base — the two shapes the kit's lib builds REST paths onto.
 *
 * @param project - the current project
 * @returns the association body fields, or an error naming what is missing
 */
export function deriveCommerceTarget(
    project: Project,
): { commerceBaseUrl: string; commerceEnv: CommerceEnv } | { error: string } {
    const backendId = project.componentSelections?.backend;
    const commerceEnv = backendId ? BACKEND_FLAVOR[backendId] : undefined;
    if (!commerceEnv) {
        return { error: `This project has no Commerce backend (found "${backendId ?? 'none'}").` };
    }

    const configs = project.componentConfigs ?? {};
    const endpointKey = commerceEnv === 'saas' ? 'ACCS_GRAPHQL_ENDPOINT' : 'ADOBE_COMMERCE_URL';
    // The paas base is configured directly; the saas base hides in the GraphQL
    // endpoint. Search every component's config — the backend's own entry is
    // authoritative but the key is unique to it either way.
    let value: string | undefined;
    for (const config of Object.values(configs)) {
        const candidate = config?.[endpointKey];
        if (typeof candidate === 'string' && candidate.length > 0) {
            value = candidate;
            break;
        }
    }
    if (!value) {
        return { error: `The Commerce backend has no ${endpointKey} configured.` };
    }
    const commerceBaseUrl = value.replace(/\/graphql\/?$/, '').replace(/\/+$/, '');
    return { commerceBaseUrl, commerceEnv };
}

/**
 * The Console identity block the install API requires — every field from the
 * project's persisted `adobe` config, with an error naming the first gap
 * (all fields are optional in the manifest; the spec requires all eight).
 *
 * @param project - the current project
 * @returns the appData, or an error naming the missing field
 */
export function buildAppData(project: Project): AppData | { error: string } {
    const adobe = project.adobe ?? {};
    // Constructed as the declared type, empty-string for absent — then validated
    // — rather than entries + a cast: a cast at this boundary would silence the
    // one checker that can see a missing spec-required field.
    const candidate: AppData = {
        consumerOrgId: adobe.organization ?? '',
        orgName: adobe.organizationName ?? '',
        projectId: adobe.projectId ?? '',
        projectName: adobe.projectName ?? '',
        projectTitle: adobe.projectTitle ?? adobe.projectName ?? '',
        workspaceId: adobe.workspace ?? '',
        workspaceName: adobe.workspaceName ?? '',
        workspaceTitle: adobe.workspaceTitle ?? adobe.workspaceName ?? '',
    };
    const missing = Object.entries(candidate).find(([, value]) => value === '');
    if (missing) {
        return { error: `The project's Adobe context is missing ${missing[0]}.` };
    }
    return candidate;
}

/** True when a reconcile 409's closed reason means "nothing to do", not "broken". */
function isBenignNoOp(error: unknown): boolean {
    return error instanceof AppManagementApiError && error.reason === 'already-current';
}

/**
 * Poll a queued (202) installation until it lands or the budget runs out.
 *
 * @param client - the app's client
 * @param deps - wait + progress
 * @returns the final state, or undefined when the budget ran out first
 */
async function pollInstallation(
    client: InstallerClient,
    deps: AppManagementInstallDeps,
): Promise<InstallationState | undefined> {
    const wait = deps.wait ?? sleep;
    const deadlineRounds = Math.ceil(POLL_BUDGET_MS / POLL_INTERVAL_MS);
    for (let round = 0; round < deadlineRounds; round++) {
        await wait(POLL_INTERVAL_MS);
        const state = await client.getInstallationState();
        if (state && state.status !== 'in-progress') {
            return state;
        }
        deps.onProgress?.('Installing into Commerce…');
    }
    return undefined;
}

/**
 * Failure signatures that mean "run the reconcile again", not "broken".
 *
 * The measured one: the installer creates its I/O Events registrations
 * concurrently and races itself on the Runtime binding package —
 * "HTTP 409 Conflict — Error 409 from upstream (…/runtime/namespaces/…/
 * packages?update=true)". Reconcile is idempotent desired-state, and retries
 * CONVERGE: measured live 2026-08-27, registrations climbed 6 → 8 → 19 → 23
 * across rounds and the fourth landed `succeeded` with every step green.
 */
const RETRYABLE_INSTALL_PATTERNS: readonly RegExp[] = [/HTTP 409 Conflict/];

/**
 * How many reconcile rounds to drive before handing back. The measured
 * convergence took 4 from a residue-laden state; a fresh install needs fewer.
 */
const MAX_RECONCILE_ROUNDS = 5;

/** Does this landed-failed state carry a signature retrying can clear? */
function isRetryableInstallFailure(state: InstallationState): boolean {
    let text: string;
    try {
        text = JSON.stringify(state.error ?? '');
    } catch {
        return false;
    }
    return RETRYABLE_INSTALL_PATTERNS.some((pattern) => pattern.test(text));
}

/** Shape one reconcile answer (post-association) into the install result. */
async function settleReconcile(
    reconciled: ReconcileResult,
    client: InstallerClient,
    deps: AppManagementInstallDeps,
): Promise<AppManagementInstallResult | 'retry'> {
    // A 202 queued the work: poll until it lands. A 200 answered synchronously.
    if (!reconciled.id) {
        return { status: 'installed', detail: reconciled.message };
    }
    const finalState = await pollInstallation(client, deps);
    if (!finalState) {
        return {
            status: 'failed',
            detail: `The installation is still running. ${APP_MANAGEMENT_HANDS_BACK}`,
        };
    }
    if (finalState.status === 'failed') {
        if (isRetryableInstallFailure(finalState)) {
            return 'retry';
        }
        return {
            status: 'failed',
            detail: `The app's installer reported a failure. ${APP_MANAGEMENT_HANDS_BACK}`,
        };
    }
    return { status: 'installed' };
}

/**
 * Install + associate a deployed app-management app with the project's
 * configured Commerce instance. Never throws — a failure comes back as
 * `status: 'failed'` with the hands-back line, because the deploy that
 * preceded this SUCCEEDED and must not be reported as broken.
 *
 * @param project - the current project (Commerce config + Adobe context)
 * @param deployedUrls - the app's persisted per-action URL map
 * @param deps - auth, logging, progress, and the test seams
 * @returns the outcome — installed / skipped (already current) / failed
 */
export async function installAppManagementApp(
    project: Project,
    deployedUrls: Record<string, string> | undefined,
    deps: AppManagementInstallDeps,
): Promise<AppManagementInstallResult> {
    const fail = (detail: string): AppManagementInstallResult => ({
        status: 'failed',
        detail: `${detail} ${APP_MANAGEMENT_HANDS_BACK}`,
    });

    const baseUrl = deriveAppManagementBaseUrl(deployedUrls);
    if (!baseUrl) {
        return fail('The deploy produced no app-management install API URL.');
    }
    const target = deriveCommerceTarget(project);
    if ('error' in target) {
        return fail(target.error);
    }
    const appData = buildAppData(project);
    if ('error' in appData) {
        return fail(appData.error);
    }

    const auth = await deps.getAuth();
    if (!auth) {
        return fail('No Adobe sign-in is available to authenticate the install call.');
    }

    const factory =
        deps.clientFactory ??
        ((url: string, clientAuth: AppManagementAuth) => new AppManagementClient(url, clientAuth));
    const client = factory(baseUrl, auth);

    try {
        deps.onProgress?.('Associating the app with your Commerce instance…');
        await client.setAssociation({
            commerceBaseUrl: target.commerceBaseUrl,
            commerceEnv: target.commerceEnv,
        });

        // Reconcile is idempotent desired-state, and the app's installer races
        // itself on registration creation (the 409 signature) — so a retryable
        // failure re-runs the SAME reconcile until it converges or the rounds
        // run out. Measured live: four rounds from a dirty state, all green.
        for (let round = 1; round <= MAX_RECONCILE_ROUNDS; round++) {
            deps.onProgress?.(
                round === 1
                    ? 'Installing into Commerce (App Management)…'
                    : `Retrying the install (transient conflict, round ${round})…`,
            );
            const reconciled = await client.reconcileInstallation({
                appData,
                ioEventsUrl: IO_EVENTS_URL,
                ioEventsEnv: IO_EVENTS_ENV,
                commerceBaseUrl: target.commerceBaseUrl,
                commerceEnv: target.commerceEnv,
            });
            const settled = await settleReconcile(reconciled, client, deps);
            if (settled !== 'retry') {
                return settled;
            }
        }
        return fail('The install kept hitting a transient conflict.');
    } catch (error) {
        if (isBenignNoOp(error)) {
            return { status: 'skipped', detail: 'Already installed and current.' };
        }
        const message = error instanceof Error ? error.message : String(error);
        deps.logger.warn(`[AppManagement] install failed: ${message}`);
        return fail(`The install call failed (${message}).`);
    }
}
