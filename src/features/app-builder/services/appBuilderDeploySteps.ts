/**
 * The steps every App Builder component operation shares (add, redeploy, remove):
 * clone and install, the persisted outcome, the storefront republish, and the
 * App Management install that follows a deploy.
 *
 * Split from `appBuilderComponentRunner.ts` (decompose-god-file, 2026-10-07); that file keeps the
 * shared contract (`RunnerResult`, `AppBuilderComponentRunnerDeps`).
 *
 * @module features/app-builder/services/appBuilderDeploySteps
 */

import type { AppBuilderComponentRunnerDeps, RunnerResult } from './appBuilderComponentRunner';
import { identityOf, recordDeployOutcome, type DeployOutcome } from './appBuilderDeployOutcome';
import type { AppManagementInstallOptions } from './appManagementUpgrade';
import { nodeForAppBuilderEntry } from '@/core/shell/demoBuilderNode';
import { buildOrgTargetFromProjectAdobe } from '@/core/shell/orgContextEnv';
import { recordInstallation } from '@/core/state/appBuilderComponentState';
import { reconcileComponentSelections } from '@/core/state/componentSelectionReconcile';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import {
    explainAdobeAccessFailure,
} from '@/features/authentication/services/authenticationErrorFormatter';
import {
    integrationUsing,
    systemsUsedBy,
} from '@/features/components/services/appBuilderComponentLinks';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, Project } from '@/types/base';
import type { TransformedComponentDefinition } from '@/types/components';
import type { Logger } from '@/types/logger';

/**
 * The org-context target a component's Adobe calls run under.
 *
 * A component may live in its OWN workspace (AB-23). When it records one, that is
 * what deploys, redeploys, undeploys and verifies target; when it does not, the
 * project's workspace is the answer — which is every component created before this
 * existed, and the reason no migration is needed.
 *
 * Only the workspace moves. The org and the Console project are the project's, and
 * a component cannot be in a different one.
 *
 * `componentId` is optional so a call with nothing to resolve reads the same as it
 * did, but every call inside this module passes one: a deploy that silently used
 * the project's workspace for a component that has its own would deploy to the
 * wrong namespace and report success.
 */
export function targetFor(project: Project, deps: AppBuilderComponentRunnerDeps, componentId?: string) {
    const base = buildOrgTargetFromProjectAdobe(project.adobe, deps.getCachedOrganization());
    const own = componentId ? project.appBuilderComponents?.[componentId]?.workspace : undefined;
    return own ? { ...base, workspaceId: own.id } : base;
}

/** Build a runtime git ComponentDefinition for a catalog entry. */
export function buildDefinition(entry: AppBuilderComponentCatalogEntry): TransformedComponentDefinition {
    const branch = entry.source.branch ?? 'main';
    return {
        id: entry.id,
        name: entry.name,
        type: entry.kind === 'mesh' ? 'dependency' : 'app-builder',
        subType: entry.kind === 'mesh' ? 'mesh' : 'app',
        source: {
            type: 'git',
            url: `https://github.com/${entry.source.owner}/${entry.source.repo}.git`,
            branch,
        },
        configuration: {
            requiresDeployment: true,
            deploymentTarget: 'adobe-io',
            // strictInstall makes a refused npm install abort the add with npm's
            // own error (AB-3). The Node travels as an install option (cloneAndInstall).
            strictInstall: true,
        },
    };
}

/** Clone + install the catalog entry; return its local path or an error. */
export async function cloneAndInstall(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    deps: AppBuilderComponentRunnerDeps,
): Promise<{ path: string } | { error: string }> {
    // The entry's own Node (a custom integration that needs another), else Demo Builder's:
    // the same one the deploy runs on, so install and deploy cannot disagree.
    const result = await deps.componentManager.installComponent(project, buildDefinition(entry), {
        nodeVersion: nodeForAppBuilderEntry(entry),
    });
    if (!result.success || !result.component?.path) {
        return { error: result.error || 'Component installation failed.' };
    }

    // ATTACH the instance, don't just take its path. `installComponent` builds
    // it — carrying `subType` off the definition — and returns it; it does not
    // put it on the project. That is the caller's job, and this caller used to
    // skip it.
    //
    // REGRESSION (2026-08-04, live): a dashboard-added mesh deployed, persisted a
    // correct keyed entry, republished the storefront — and came back as
    // `mesh=none` on the next reload with an EMPTY integrations grid. With no
    // instance persisted, the next project load let `discoverComponents`
    // synthesize a thin one from the directory alone, with no `subType`, and
    // `getMeshComponentInstance` matches on `subType === 'mesh'`. The keyed map
    // and the instance are read by different surfaces, so the projects-list card
    // said Deployed while the dashboard said none.
    project.componentInstances = project.componentInstances ?? {};
    project.componentInstances[entry.id] = result.component;

    return { path: result.component.path };
}

/**
 * Run the caller's bundle refresh, swallowing failures.
 *
 * A deploy that succeeded must not report failure because a markdown file could
 * not be rewritten — the bundle is repaired again on the next activation sweep
 * or by "Regenerate AI Files". The log line is the trail.
 */
export async function refreshBundleQuietly(
    project: Project,
    deps: AppBuilderComponentRunnerDeps,
    reason: 'add' | 'remove',
): Promise<void> {
    if (!deps.refreshAiBundle) return;
    try {
        await deps.refreshAiBundle(project);
    } catch (err) {
        deps.logger.warn(
            `[AppBuilder] Could not refresh the AI bundle after an integration ${reason}: ` +
                (err instanceof Error ? err.message : String(err)),
        );
    }
}

/**
 * Record an ADD's outcome and save.
 *
 * `create: true` keys the entry by the component's OWN id. Without it the write
 * would go through resolveKeyedComponentId, whose legacy-migration branch reuses
 * the one existing same-kind entry's key — which for an add means the second
 * integration lands on the first one's key and overwrites it.
 *
 * ALSO syncs the CALLER's project reference in place (like recordDeployOutcome):
 * callers such as the creation executor keep saving their own reference after
 * the runner returns — without the sync, those later saves clobbered the keyed
 * write and a creation-deployed integration vanished from the manifest.
 */
export async function persistOutcome(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    outcome: DeployOutcome,
    deps: AppBuilderComponentRunnerDeps,
): Promise<void> {
    recordDeployOutcome(project, entry.kind, entry.id, outcome, { create: true });
    // Record the SELECTION too. Configure's rail and project reset both read the
    // selection lists rather than the keyed map, and this path is the only live
    // add — leaving them empty is what made a dashboard-added mesh invisible to
    // Configure and disposable by reset.
    reconcileComponentSelections(project);
    await deps.saveProject(project);
    // Composition changed — the skill set follows it. Best-effort: a bundle
    // refresh must never fail a deploy that already landed.
    await refreshBundleQuietly(project, deps, 'add');
}

/** The one provided value the storefront config reads (configGenerator). */
const STOREFRONT_PROVIDED_VAR = 'MESH_ENDPOINT';

/**
 * The storefront config reads ONE provided var; a component providing only to other
 * components (the ERP) earns no republish on its way out.
 */
export function providesStorefrontVar(state: AppBuilderComponentState): boolean {
    return Boolean(state.providesEnvVars && STOREFRONT_PROVIDED_VAR in state.providesEnvVars);
}

/**
 * Republish the storefront when the component just deployed provides the var the
 * storefront config READS (else no-op). A component that provides only to other
 * components — the ERP's base URL to its integration — changes nothing the
 * storefront serves, so it earns no republish. It asked of the whole PROJECT
 * until 2026-09-28, so on any project with a mesh every add republished, and an
 * expired DA.live session held an agent's ERP add on a sign-in prompt for good.
 *
 * @returns a warning for the SC when the republish did not fully land — the
 *   operation stands, but the storefront is not current. On 2026-09-24 an add
 *   reported done over a CDN publish refused for want of a DA.live session, and
 *   only the Debug Logs knew.
 */
export async function republishIfProvided(
    project: Project,
    id: string,
    deps: AppBuilderComponentRunnerDeps,
): Promise<string | undefined> {
    const state = project.appBuilderComponents?.[id];
    if (!state || !providesStorefrontVar(state)) {
        return undefined;
    }
    const published = await deps.republishStorefront({
        project,
        secrets: deps.secrets,
        logger: deps.logger,
    });
    if (!published.success) {
        return `The storefront was not republished: ${published.error ?? 'the republish did not finish'}`;
    }
    if (published.cdnError) {
        return `The storefront still serves its previous config.json: ${published.cdnError}`;
    }
    return undefined;
}

/** A finished add or deploy, carrying the warnings it has (left-behind code, republish). */
export function withWarnings(...warnings: Array<string | undefined>): RunnerResult {
    const said = warnings.filter((warning): warning is string => Boolean(warning));
    return { success: true, ...(said.length > 0 ? { warnings: said } : {}) };
}

/**
 * What the SC reads for a failure: Adobe's permission and outage refusals in plain words,
 * anything else as it was written. Adobe's own words still reach Debug Logs.
 */
export function readableFailure(reason: string, logger: Logger): string {
    const plain = explainAdobeAccessFailure(reason);
    if (!plain) return reason;
    logger.warn(`[AppBuilderComponent Runner] Adobe refused: ${reason}`);
    return plain;
}

/** What a run answers for an id the project does not have. */
export function notFound(id: string): RunnerResult {
    return { success: false, error: `AppBuilderComponent "${id}" not found.` };
}

/**
 * A failed deploy's outcome — INCLUDING why it failed.
 *
 * The reason used to be returned to the caller and dropped from state, so a
 * failed add persisted `status:'error'` with nothing to explain it and no surface
 * could answer "why?" once the notification faded. `error` is the one field a
 * failed entry exists to carry.
 *
 * `name` is the component's own: the name it already has on a redeploy, the
 * name its deploy would give it on an add. The catalog's name here renamed a
 * failed "Acme ERP" to "ERP" (2026-09-18).
 */
export function errorOutcome(
    entry: AppBuilderComponentCatalogEntry,
    reason: string,
    name: string,
): DeployOutcome {
    return { status: 'error', ...identityOf(entry), name, error: reason };
}

/**
 * Send the integration its list of systems once what they deploy with is settled (AB-51):
 * after an integration that uses listed systems deploys — its fill, next, asks the
 * integration by those ids — and after a listed system redeploys, whose id or address may
 * be new. Without this a first pair served the standalone id `erp` while the ERP deployed
 * as `northwind`, and no fill could find it. A list that could not be sent is a warning
 * on the deploy, never a failure: the deploy stands, and the next deploy sends it again.
 *
 * @returns the warning, or undefined
 */
export async function listSystemsAfterDeploy(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    deps: AppBuilderComponentRunnerDeps,
): Promise<string | undefined> {
    if (!deps.listSystems) return undefined;
    const integrationId =
        entry.kind === 'integration'
            ? systemsUsedBy(project, entry.id, deps.catalog).length > 0
                ? entry.id
                : undefined
            : entry.listedAs
              ? integrationUsing(project, entry.id, deps.catalog)
              : undefined;
    if (!integrationId) return undefined;
    deps.onProgress?.(OPERATION_STAGES.deploying.label, 'Telling the integration about its ERPs');
    const reason = await deps.listSystems(project, integrationId);
    if (!reason) return undefined;
    deps.logger.warn(
        `[AppBuilderComponent Runner] ${integrationId} was not sent its ERP list: ${reason}`,
    );
    const name = project.appBuilderComponents?.[integrationId]?.name ?? integrationId;
    return `${name} was not told about its ERPs (${reason.replace(/\.$/u, '')}). Redeploy it to send the list again.`;
}

/**
 * The post-deploy install pass for `lifecycle: 'app-management'` apps.
 *
 * Runs AFTER the deploy outcome persisted, and never fails the deploy: the app
 * IS deployed — an install failure leaves it dormant with the hands-back
 * recorded on `installation`, which is the owner's automatic-with-hands-back
 * decision (2026-08-27). No-op for every other entry, and when the caller
 * wired no installer (mesh paths, bare tests).
 */
export async function installIfAppManagement(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    deps: AppBuilderComponentRunnerDeps,
    deploy: { componentPath: string; since: string },
): Promise<void> {
    if (entry.lifecycle !== 'app-management' || !deps.installAppManagement) {
        return;
    }
    const state = project.appBuilderComponents?.[entry.id];
    const options: AppManagementInstallOptions = {
        appVersion: await deps.readAppVersion?.(deploy.componentPath),
        since: deploy.since,
    };
    // The installer's messages carry live detail (retry rounds), so they are the STEP
    // under one install stage — the stage keeps its expectation line while they change.
    const result = await deps.installAppManagement(
        project,
        entry.id,
        (message) => deps.onProgress?.(OPERATION_STAGES.installingIntoCommerce.label, message),
        options,
    );
    if (state) {
        recordInstallation(state, result);
        await deps.saveProject(project);
    }
    if (result.status === 'installed') {
        await fillAfterInstall(project, entry, deps);
    }
    if (result.status === 'upgraded' && result.detail) {
        deps.onProgress?.(result.detail);
    }
    if (result.status === 'failed') {
        deps.logger.warn(
            `[AppBuilderComponent Runner] ${entry.id} deployed but not installed: ${result.detail}`,
        );
        deps.onProgress?.(
            OPERATION_STAGES.installingIntoCommerce.label,
            result.detail ?? 'Install into Commerce did not finish.',
        );
    }
}

/**
 * Fill the system the entry serves from Commerce, once the install stands. No-op for an
 * entry that does not fill a system, and when the caller wired no fill. A failure never
 * fails the deploy (the pair is installed, merely empty), and the line says why.
 */
async function fillAfterInstall(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    deps: AppBuilderComponentRunnerDeps,
): Promise<void> {
    if (!entry.fillsSystem || !deps.fillSystem) {
        return;
    }
    const stage = OPERATION_STAGES.loadingErpDemoData.label;
    deps.onProgress?.(stage, 'Reading Commerce');
    const outcome = await deps.fillSystem(project, entry, (step) => deps.onProgress?.(stage, step));
    if (outcome.status === 'filled') {
        return;
    }
    deps.logger.warn(
        `[AppBuilderComponent Runner] ${entry.id} installed but its system was not filled: ${outcome.detail}`,
    );
    deps.onProgress?.(stage, `Demo data did not load: ${outcome.detail}`);
}
