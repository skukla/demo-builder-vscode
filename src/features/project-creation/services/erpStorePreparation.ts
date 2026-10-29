/**
 * the demo setup's Apply as part of adding the ERP integration (owner, 2026-10-22): before the
 * ERP is filled, the catalog's setup steps Demo Builder can apply are applied, because the
 * fill relies on `erp_owner` being in the attribute sets and on the ERP's warehouse. The run
 * is the manual Prepare's engine (`applyPreparation`), and its record and checklist are saved
 * exactly as the manual Prepare saves them (`recordsAfterRun`), so Undo per step and the
 * removal's teardown (`erpSetupTeardown.ts`) put it back unchanged. Steps without a fix stay
 * in the setup guide.
 *
 * Every add of the integration reaches it: the card and the agent's add_integration
 * (`appBuilderComponentAdd.ts`) and project creation (`executorAppBuilderPhase.ts`) all run
 * the runner, whose first install calls the `prepareStore` dep (`erpRunnerDeps.ts`). An extra
 * ERP's add never does: its entry fills no system of its own.
 *
 * A composition file: it wires the signed Commerce client and the check reader into the pure
 * engine.
 *
 * @module features/project-creation/services/erpStorePreparation
 */

import type { CredentialStore } from '@/features/ai/server/savedRestCredential';
import { runSetupCheck } from '@/features/app-builder/services/setupChecks';
import { reachesEveryWebsite } from '@/features/app-builder/services/storePreparation/fixReach';
import {
    applyPreparation,
    previewPreparation,
    type PreparationDeps,
} from '@/features/app-builder/services/storePreparation/storePreparationEngine';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { erpNamesOf, setupCheckReaderFor } from '@/features/dashboard/services/setupCheckReader';
import { recordsAfterRun } from '@/features/dashboard/services/setupStepRecords';
import { openCommerce } from '@/features/project-creation/services/erpAssignProducts';
import type { AppBuilderComponentCatalogEntry, SetupStep } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, Project } from '@/types/base';
import type { AddPreparationRead, PreparationStepReport } from '@/types/storePreparation';

/** What the preparation needs from the host. */
export interface StorePreparationContext {
    authManager: AuthenticationService;
    credentials: CredentialStore | undefined;
    fetchImpl?: typeof fetch;
}

export type PrepareOnAddOutcome = { status: 'prepared'; warning?: string } | { status: 'failed'; detail: string };

const stepsOf = (entry: AppBuilderComponentCatalogEntry): SetupStep[] => entry.setupSteps ?? [];

/** The engine's deps for this project's store, or why there are none. */
async function preparationDeps(
    project: Project,
    integrationId: string,
    ctx: StorePreparationContext,
): Promise<PreparationDeps | { refusal: string }> {
    const commerce = await openCommerce(project, ctx.authManager, ctx.credentials, ctx.fetchImpl);
    if ('refusal' in commerce) return commerce;
    const { read, scope } = await setupCheckReaderFor(project, ctx.authManager, ctx.credentials, ctx.fetchImpl);
    const erpNames = erpNamesOf(project, integrationId);
    return {
        commerce,
        websiteCode: scope.websiteCode,
        erpNames,
        runCheck: (check) => runSetupCheck(check, read, { ...scope, erpNames }),
    };
}

/** The labels of the steps that will apply and reach every website. */
function everyWebsiteOf(steps: readonly SetupStep[], reports: readonly PreparationStepReport[]): string[] {
    const applying = new Set(reports.filter((report) => report.state === 'applicable').map((report) => report.id));
    return steps
        .filter((step) => step.fix && applying.has(step.id) && reachesEveryWebsite(step.fix))
        .map((step) => step.label ?? step.title);
}

/**
 * What the add will change in the store, read now: each step as the manual Prepare's preview
 * says it. Writes nothing.
 *
 * @param project - the project the integration is being added to
 * @param entry - the integration's catalog entry
 * @param ctx - the sign-in and the credential store
 */
export async function previewStoreForAdd(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    ctx: StorePreparationContext,
): Promise<AddPreparationRead | { refusal: string }> {
    const deps = await preparationDeps(project, entry.id, ctx);
    if ('refusal' in deps) return deps;
    const saved = project.appBuilderComponents?.[entry.id] ?? {};
    const preview = await previewPreparation(stepsOf(entry), saved, deps);
    return { steps: preview.reports, everyWebsite: everyWebsiteOf(stepsOf(entry), preview.reports) };
}

/** What Commerce refused, by step, as one sentence; undefined when it took everything. */
function refusedWarning(reports: readonly PreparationStepReport[]): string | undefined {
    const refused = reports.flatMap((report) => report.rejected.map((why) => `${report.label}: ${why}`));
    return refused.length > 0 ? `Commerce refused part of the demo setup: ${refused.join('; ')}.` : undefined;
}

/**
 * Prepare the store for the integration just installed: apply every step with a fix, then
 * save the record and the checked steps on its component, as the manual Prepare does.
 * Never throws.
 *
 * @param project - the project (its component is updated in place, then saved)
 * @param entry - the integration's catalog entry
 * @param ctx - the sign-in, the credential store and the save
 * @param onStep - where each step's progress goes
 */
export async function prepareStoreOnAdd(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    ctx: StorePreparationContext & { saveProject: (project: Project) => Promise<void> },
    onStep: (step: string) => void,
): Promise<PrepareOnAddOutcome> {
    const state = project.appBuilderComponents?.[entry.id];
    if (!state) return { status: 'failed', detail: `"${entry.id}" is not in this project.` };
    try {
        const opened = await preparationDeps(project, entry.id, ctx);
        if ('refusal' in opened) return { status: 'failed', detail: opened.refusal };
        const deps: PreparationDeps = { ...opened, onProgress: (step, what) => onStep(`${step.label ?? step.title}: ${what}`) };
        const steps = stepsOf(entry);
        const outcome = await applyPreparation(steps, state, deps);
        const { storePreparation: _old, ...rest } = state;
        const next: AppBuilderComponentState = {
            ...rest,
            setupSteps: await recordsAfterRun(steps, state.setupSteps, outcome.checks, outcome.reports, deps.runCheck),
            ...(outcome.record ? { storePreparation: outcome.record } : {}),
        };
        project.appBuilderComponents = { ...(project.appBuilderComponents ?? {}), [entry.id]: next };
        await ctx.saveProject(project);
        const warning = refusedWarning(outcome.reports);
        return { status: 'prepared', ...(warning ? { warning } : {}) };
    } catch (error) {
        return { status: 'failed', detail: error instanceof Error ? error.message : String(error) };
    }
}
