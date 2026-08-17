/**
 * Install the wizard's chosen datapack as part of the build.
 *
 * Stage 4 shipped as a seam — the wizard RECORDED a pack and the dashboard
 * installed it afterwards. The intent was always that the build runs it, with
 * the target chosen in the wizard, and this closes that loop.
 *
 * The argument against installing during creation was that an import needs a
 * reachable instance with working credentials. That does not survive the
 * wizard's own order: the Commerce **Connection** sub-step validates exactly
 * that, several sub-steps earlier, and **Business Structure** records the
 * website and store view this writes into. By the time this runs, both are
 * measured facts.
 *
 * **It can never fail the build.** A project is complete and usable without
 * sample data, and by the time an import goes wrong the instance is already
 * partly populated — which the wizard has no rollback for. Failing creation
 * would mark a good project bad over optional content and leave the mess
 * anyway. So every failure is reported and swallowed, and the dashboard's
 * verified import modal is where a retry happens.
 *
 * Dependencies are injected rather than imported: this is orchestration, and
 * every interesting case (a refusal, a partial import, an empty inventory) is
 * worth a test that does not need a live service.
 *
 * @module features/data-installer/services/sampleDataInstall
 */

import type { DataTypeStatus } from '../types';
import { deriveImportInstance } from './importInstance';

/** The scope an import writes into, as the wizard recorded it. */
export interface InstallTarget {
    websiteCode: string;
    storeCode: string;
}

/** What the phase did, for the build to report. */
export interface SampleDataResult {
    /** True only when an import was actually started and watched. */
    ran: boolean;
    /** True when there was nothing to do — no pack, no target, no items. */
    skipped?: boolean;
    outcome?: string;
    perType?: Record<string, DataTypeStatus>;
    /** Why it did not run, or did not finish cleanly. Never a credential. */
    reason?: string;
}

/** The per-backend spelling of the same two facts. */
const SCOPE_KEYS: Record<string, { website: string; store: string }> = {
    'adobe-commerce-accs': { website: 'ACCS_WEBSITE_CODE', store: 'ACCS_STORE_VIEW_CODE' },
    'adobe-commerce-paas': {
        website: 'ADOBE_COMMERCE_WEBSITE_CODE',
        store: 'ADOBE_COMMERCE_STORE_VIEW_CODE',
    },
};

interface ProjectLike {
    datapack?: { name: string; version: string };
    componentSelections?: { backend?: string };
    componentConfigs?: Record<string, Record<string, unknown>>;
}

/**
 * The website/store pair the Business Structure sub-step recorded.
 *
 * Both codes or nothing. The service validates them as a PAIR and falls back to
 * `base` when they are absent, so half a target is worse than none — it would
 * write into a scope nobody chose.
 */
export function resolveInstallTarget(project: ProjectLike): InstallTarget | null {
    const backend = project.componentSelections?.backend;
    const keys = backend ? SCOPE_KEYS[backend] : undefined;
    if (!backend || !keys) {
        return null;
    }
    const config = project.componentConfigs?.[backend] ?? {};
    const websiteCode = String(config[keys.website] ?? '');
    const storeCode = String(config[keys.store] ?? '');

    return websiteCode && storeCode ? { websiteCode, storeCode } : null;
}

/**
 * What to ask for: what the service HOLDS, plus the dependency nobody is here
 * to warn about.
 *
 * The declared list is not it — a pack can declare a type the service stores no
 * item for, and asking imports nothing while reporting a failure that is not
 * one.
 *
 * `products` without `customer_groups` is the measured trap (2026-08-14): tier
 * prices name a group, the service resolves that name at import time, and with
 * no groups the lookup failed and took the ENTIRE products type down — 56
 * products, zero landed. The import modal warns a human. A build phase has
 * nobody to warn, so it corrects it. Only when the pack actually holds groups;
 * asking for a type it has not got is a 400.
 */
export function typesToInstall(declared: string[], stored: string[]): string[] {
    // The intersection: declared AND actually stored. An earlier version wrote
    // `declared.includes(t) || stored.includes(t)`, where the second term is
    // always true for a member of `stored` — a filter that filtered nothing.
    const types = stored.filter((type) => declared.includes(type));
    const needsGroups =
        types.includes('products') &&
        !types.includes('customer_groups') &&
        declared.includes('customer_groups');

    return needsGroups ? [...types, 'customer_groups'] : types;
}

/** What the phase needs, injected so every branch is testable without a service. */
export interface SampleDataDeps {
    /** Resolves the pair the request carries. The pair itself never leaves here. */
    credentials: (
        project: ProjectLike,
    ) => Promise<{ ok: boolean; credentials?: unknown; reason?: string }>;
    /** The types the service actually stores for this pack. */
    inventory: (id: { name: string; version: string }) => Promise<string[]>;
    startImport: (request: unknown) => Promise<{ activationId: string }>;
    /** Removes it again, for Reset. Same request, different verb. */
    startDelete?: (request: unknown) => Promise<{ activationId: string }>;
    watch: (args: {
        activationId: string;
        requestedTypes: string[];
        /**
         * Names the job in the poller's log line. Defaults to `import`, which is
         * what a REMOVAL was labelled for its whole life — every poll of a
         * reset's delete read `data-installer import <id>`, saying the opposite
         * of what was running.
         */
        operation?: 'import' | 'reset';
        onProgress?: (perType: Record<string, DataTypeStatus>) => void;
    }) => Promise<{ outcome: string; perType: Record<string, DataTypeStatus> }>;
    /** Live per-type progress, for the build's progress line. */
    onProgress?: (perType: Record<string, DataTypeStatus>) => void;
}

/**
 * Install the recorded pack. See the module docstring for why it cannot throw.
 */
export function installSampleData(
    project: ProjectLike,
    deps: SampleDataDeps,
): Promise<SampleDataResult> {
    return runSampleDataJob(project, deps, 'install');
}

/**
 * Remove it again, for the Reset workflow.
 *
 * The same job as installing with a different verb — same target, same
 * instance, same inventory-derived type list — so it runs through the same
 * runner. A near-copy would drift the moment one side gained a guard, and this
 * is the side that DELETES from a live Commerce instance.
 *
 * The caller is responsible for having confirmed. This does not ask.
 */
export function removeSampleData(
    project: ProjectLike,
    deps: SampleDataDeps,
): Promise<SampleDataResult> {
    return runSampleDataJob(project, deps, 'remove');
}

async function runSampleDataJob(
    project: ProjectLike,
    deps: SampleDataDeps,
    mode: 'install' | 'remove',
): Promise<SampleDataResult> {
    const id = project.datapack;
    if (!id) {
        return { ran: false, skipped: true, reason: 'This project chose no sample data.' };
    }

    const target = resolveInstallTarget(project);
    if (!target) {
        return {
            ran: false,
            skipped: true,
            reason: 'No website and store view were recorded for this project.',
        };
    }

    // Shared with `get-datapack-import-target`, so the build and the modal
    // cannot resolve the same project to different instances.
    const commerceInstance = deriveImportInstance(project.componentConfigs as never);
    if (!commerceInstance) {
        return {
            ran: false,
            skipped: true,
            reason: 'This project names no Commerce instance to act on.',
        };
    }

    try {
        const credentials = await deps.credentials(project);
        if (!credentials.ok) {
            return {
                ran: false,
                skipped: true,
                reason: credentials.reason ?? 'No usable Commerce credentials.',
            };
        }

        const stored = await deps.inventory(id);
        const dataTypes = typesToInstall(stored, stored);
        if (dataTypes.length === 0) {
            return {
                ran: false,
                skipped: true,
                reason: 'The service holds no data for this datapack.',
            };
        }

        // The REAL request shape: `target` is nested and `credentials` rides
        // along. An earlier version flattened websiteCode/storeCode to the top
        // level — a shape the client does not accept, which the test agreed with
        // because the test invented it too.
        const request = {
            id,
            commerceInstance,
            dataTypes,
            credentials: credentials.credentials,
            target,
        };
        const start = mode === 'remove' ? deps.startDelete : deps.startImport;
        if (!start) {
            return { ran: false, reason: 'This caller cannot remove sample data.' };
        }
        const started = await start(request);
        const watched = await deps.watch({
            activationId: started.activationId,
            requestedTypes: dataTypes,
            operation: 'reset',
            ...(deps.onProgress ? { onProgress: deps.onProgress } : {}),
        });

        return { ran: true, outcome: watched.outcome, perType: watched.perType };
    } catch (error) {
        // Swallowed on purpose — see the module docstring. A build must not fail
        // over optional content, least of all after the instance is already
        // partly written.
        return {
            ran: false,
            reason: error instanceof Error ? error.message : String(error),
        };
    }
}
