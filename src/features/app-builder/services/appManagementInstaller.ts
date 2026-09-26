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
 * - Base URL: the `app-management` package's web-action URLs in the persisted
 *   `deployedUrls` (derived from the app's config at deploy time — see
 *   `deployedUrls.ts`), cut at the package segment — confirmed live 2026-08-27
 *   (GET answered 401 at the predicted base).
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

import { buildAppData } from './appManagementAppData';
import {
    CREDENTIAL_ACTIVATION_WAITS_MS,
    isCredentialNotReadyFailure,
    isRetryableInstallFailure,
} from './appManagementInstallFailures';
import {
    AppManagementApiError,
    AppManagementClient,
    type AppManagementAuth,
    type CommerceEnv,
    type InstallationState,
    type ReconcileResult,
} from './appManagementClient';
import {
    followUpgrade,
    installedOutcome,
    isRunningUpgrade,
    isUpgradeRefusal,
    plannedOnly,
    REFUSED_UPGRADE,
    settleNoOp,
    type AppManagementInstallResult,
} from './appManagementUpgrade';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { getBackendCommerceContract } from '@/features/components/services/backendCommerce';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

/** The kit lib's own defaults (read from aio-commerce-lib-api source, 2026-08-27). */
export const IO_EVENTS_URL = 'https://api.adobe.io/events';
export const IO_EVENTS_ENV = 'prod';

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
    'getInstallationState' | 'getLatestLifecycleAttempt' | 'reconcileInstallation' | 'setAssociation'
>;

export interface AppManagementInstallDeps {
    /** Resolve IMS auth for the app's org; undefined = cannot authenticate. */
    getAuth: () => Promise<AppManagementAuth | undefined>;
    logger: Logger;
    onProgress?: (message: string) => void;
    /** Client construction (tests inject a fake; default builds the real one). */
    clientFactory?: (baseUrl: string, auth: AppManagementAuth) => InstallerClient;
    /** Poll pacing (tests inject an instant resolver). */
    wait?: (ms: number) => Promise<void>;
    /** The app version being installed (its manifest's `metadata.version`), when known. */
    appVersion?: string;
    /** When the deploy this pass follows started (ISO); an upgrade since then is this deploy's. */
    since?: string;
}

/**
 * The App Management API base from the deployed action URLs: any URL containing
 * the reserved `app-management` package segment, cut just after it.
 *
 * @param deployedUrls - the app's persisted per-action URL map
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

/**
 * The Commerce association target from the project's configured backend.
 *
 * WHICH env key carries the base URL — and which flavor the backend is — comes
 * from the registry's per-backend `commerce` contract
 * ({@link getBackendCommerceContract}), never from key names kept here: a
 * private copy is the silent-rename failure mode (rename the key in
 * components.json and code holding the old name finds nothing, with no error
 * pointing anywhere — owner audit, 2026-08-27).
 *
 * @param project - the current project
 * @returns the association body fields, or an error naming what is missing
 */
export function deriveCommerceTarget(
    project: Project,
): { commerceBaseUrl: string; commerceEnv: CommerceEnv } | { error: string } {
    const backendId = project.componentSelections?.backend;
    const contract = getBackendCommerceContract(backendId);
    if (!contract) {
        return { error: `This project has no Commerce backend (found "${backendId ?? 'none'}").` };
    }

    // Search every component's config — the backend's own entry is
    // authoritative but the declared key is unique to it either way.
    const configs = project.componentConfigs ?? {};
    let value: string | undefined;
    for (const config of Object.values(configs)) {
        const candidate = config?.[contract.baseUrlKey];
        if (typeof candidate === 'string' && candidate.length > 0) {
            value = candidate;
            break;
        }
    }
    if (!value) {
        return { error: `The Commerce backend has no ${contract.baseUrlKey} configured.` };
    }
    // Trailing slashes first, so a '/graphql/' value still matches the suffix.
    let commerceBaseUrl = value.replace(/\/+$/, '');
    if (contract.baseUrlStripSuffix && commerceBaseUrl.endsWith(contract.baseUrlStripSuffix)) {
        commerceBaseUrl = commerceBaseUrl
            .slice(0, -contract.baseUrlStripSuffix.length)
            .replace(/\/+$/, '');
    }
    return { commerceBaseUrl, commerceEnv: contract.flavor };
}

/**
 * True when a reconcile 409 means "nothing to do", not "broken". The spec's
 * closed `reason` enum says `already-current`; the LIVE API answers with a
 * message and no reason at all ("Installation has already completed
 * successfully." — measured 2026-08-27), so both forms count.
 */
function isBenignNoOp(error: unknown): boolean {
    if (!(error instanceof AppManagementApiError) || error.status !== 409) {
        return false;
    }
    return (
        error.reason === 'already-current' ||
        /already completed successfully/i.test(error.noOpMessage ?? '')
    );
}

/**
 * Poll a queued (202) installation until it lands or the budget runs out.
 *
 * @param client - the app's client
 * @param deps - wait + progress
 * @returns the final state, or undefined when the budget ran out first
 */
/**
 * The poll allowance for ONE WHOLE install — shared across retry rounds, so
 * five racy rounds can never stack five full budgets (audit finding: the
 * per-round budget made the worst case 5 × 3 minutes).
 */
interface PollBudget {
    roundsLeft: number;
}

function newPollBudget(): PollBudget {
    return { roundsLeft: Math.ceil(POLL_BUDGET_MS / POLL_INTERVAL_MS) };
}

async function pollInstallation(
    client: InstallerClient,
    deps: AppManagementInstallDeps,
    budget: PollBudget,
): Promise<InstallationState | undefined> {
    const wait = deps.wait ?? sleep;
    while (budget.roundsLeft > 0) {
        budget.roundsLeft--;
        await wait(POLL_INTERVAL_MS);
        const state = await client.getInstallationState();
        if (state && state.status !== 'in-progress') {
            return state;
        }
        // No progress line per round: the install's own line ("Installing into
        // Commerce (App Management)…") still describes it, and a new line every
        // five seconds read as a new step each time.
    }
    return undefined;
}

/**
 * How many reconcile rounds to drive before handing back. The measured
 * convergence took 4 from a residue-laden state; a fresh install needs fewer.
 */
const MAX_RECONCILE_ROUNDS = 5;

type Settled = AppManagementInstallResult | 'retry' | 'credential-not-ready';

/** Shape one reconcile answer (post-association) into the install result. */
async function settleReconcile(
    reconciled: ReconcileResult,
    client: InstallerClient,
    deps: AppManagementInstallDeps,
    budget: PollBudget,
): Promise<Settled> {
    if (reconciled.operation === 'upgrade') {
        return reconciled.accepted
            ? followUpgrade(client, deps.onProgress, deps.wait)
            : plannedOnly(deps.appVersion);
    }
    // A 202 queued the work: poll until it lands. A 200 answered synchronously.
    if (!reconciled.id) {
        return installedOutcome(deps.appVersion, reconciled.message);
    }
    const finalState = await pollInstallation(client, deps, budget);
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
        if (isCredentialNotReadyFailure(finalState)) {
            return 'credential-not-ready';
        }
        return {
            status: 'failed',
            detail: `The app's installer reported a failure. ${APP_MANAGEMENT_HANDS_BACK}`,
        };
    }
    return installedOutcome(deps.appVersion);
}

/**
 * Run the reconcile until it lands, retrying what retrying can clear.
 *
 * Reconcile is idempotent desired-state, so a retry repeats the SAME call. The installer
 * conflict (the 409 self-race) is retried at once, up to {@link MAX_RECONCILE_ROUNDS}; a
 * credential Adobe has not yet activated is retried after each pause in
 * {@link CREDENTIAL_ACTIVATION_WAITS_MS}. The two are counted separately.
 */
async function driveReconcile(
    client: InstallerClient,
    appData: Exclude<ReturnType<typeof buildAppData>, { error: string }>,
    target: Exclude<ReturnType<typeof deriveCommerceTarget>, { error: string }>,
    deps: AppManagementInstallDeps,
    fail: (detail: string) => AppManagementInstallResult,
): Promise<AppManagementInstallResult> {
    const budget = newPollBudget();
    const wait = deps.wait ?? sleep;
    let conflictRound = 1;
    let credentialWaits = 0;
    deps.onProgress?.('Installing into Commerce (App Management)');
    for (;;) {
        const reconciled = await client.reconcileInstallation({
            appData,
            ioEventsUrl: IO_EVENTS_URL,
            ioEventsEnv: IO_EVENTS_ENV,
            commerceBaseUrl: target.commerceBaseUrl,
            commerceEnv: target.commerceEnv,
        });
        const settled = await settleReconcile(reconciled, client, deps, budget);
        if (settled === 'retry') {
            conflictRound++;
            if (conflictRound > MAX_RECONCILE_ROUNDS) {
                return fail('The install kept hitting a transient conflict.');
            }
            deps.onProgress?.(`Retrying the install (transient conflict, round ${conflictRound})`);
        } else if (settled === 'credential-not-ready') {
            const pause = CREDENTIAL_ACTIVATION_WAITS_MS[credentialWaits++];
            if (pause === undefined) {
                return fail(
                    "Commerce could not sign in with the workspace's new credential yet; Adobe " +
                        'can take several minutes to activate one. Press Install again in a few minutes.',
                );
            }
            deps.onProgress?.(
                `Waiting for Adobe to activate the new credential (next try in ${pause / 1000} seconds)`,
            );
            await wait(pause);
        } else {
            return settled;
        }
    }
}

/**
 * Install + associate a deployed app-management app with the project's
 * configured Commerce instance. Never throws — a failure comes back as
 * `status: 'failed'` with the hands-back line, because the deploy that
 * preceded this SUCCEEDED and must not be reported as broken.
 *
 * @param project - the current project (Commerce config + Adobe context)
 * @param componentId - the app's component id; picks the workspace it lives in
 * @param deployedUrls - the app's persisted per-action URL map
 * @param deps - auth, logging, progress, and the test seams
 * @returns the outcome — installed / skipped (already current) / failed
 */
export async function installAppManagementApp(
    project: Project,
    componentId: string,
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
    const appData = buildAppData(project, componentId);
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
        deps.onProgress?.('Associating the app with your Commerce instance');
        await client.setAssociation({
            commerceBaseUrl: target.commerceBaseUrl,
            commerceEnv: target.commerceEnv,
        });

        // The deploy's post-deploy hook may already be upgrading the app; asking
        // again while it runs fails, so follow it instead.
        const running = await client.getLatestLifecycleAttempt().catch(() => undefined);
        if (isRunningUpgrade(running)) {
            return await followUpgrade(client, deps.onProgress, deps.wait);
        }

        // Which failures are retried, and how: see driveReconcile.
        return await driveReconcile(client, appData, target, deps, fail);
    } catch (error) {
        if (isBenignNoOp(error)) {
            return settleNoOp(client, deps.appVersion, deps.since);
        }
        if (isUpgradeRefusal(error)) {
            return REFUSED_UPGRADE;
        }
        const message = error instanceof Error ? error.message : String(error);
        deps.logger.warn(`[AppManagement] install failed: ${message}`);
        return fail(`The install call failed (${message}).`);
    }
}
