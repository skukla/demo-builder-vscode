/**
 * Project Creation — an Edit that changes the datapack (PL-75).
 *
 * The rebuild re-imported the new pack on top of the old one, and could never
 * clear one: an Edit that chose "no datapack" kept the old choice. Now Finish asks
 * the Switch question (one datapack per project: switch, or change nothing), then records the new choice and runs creation's own steps after it:
 * the import, catalog pre-warming and, on an Edge Delivery storefront, the
 * category pages for the categories the new pack brings. When the old data was
 * removed, the pages Demo Builder wrote for it go first, as in Reset.
 *
 * @module features/project-creation/handlers/executorEditDatapack
 */

import * as vscode from 'vscode';
import { executeSampleDataPhase } from './executorDatapackPhase';
import type { ProgressTracker } from './shared';
import { installedByDemoBuilder } from '@/features/data-installer/services/buildDatapackEngine';
import { dropStaleFailure } from '@/features/data-installer/services/installFailure';
import { type NameMemory, rememberedPackName } from '@/features/data-installer/services/packNames';
import {
    beginSampleDataRemovalCheck,
    askSaveAsNameWith,
    removeProjectSampleDataOutcome,
} from '@/features/eds/services/reset/edsResetDatapack';
import type { DatapackRemoval } from '@/features/eds/services/reset/resetDatapackStep';
import {
    executeCatalogMenuPhase,
    rewriteCatalogMenuPhase,
} from '@/features/project-creation/services/catalogMenuPhase';
import { executeCatalogPrewarmPhase } from '@/features/project-creation/services/catalogPrewarmPhase';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { isEdsProject } from '@/types/typeGuards';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

/**
 * Asks to switch the project from its pack to `next` (by library name), or to uninstall it when
 * `next` is undefined. True to go ahead; false changes nothing.
 */
export type AskSwitchDatapack = (project: Project, next: string | undefined) => Promise<boolean>;

/** Said when the SC cancels: the Edit stops before anything runs. */
const CANCELLED = 'Saving changes was cancelled by user. Nothing was changed.';

/**
 * The Switch question, in a VS Code dialog, in the Datapacks screen's words (decisions J8-1): one
 * datapack per project in beta.153, so another pack is "Switch to Bodea?" with Switch, and no pack
 * is "Uninstall Bodea?" with Uninstall. VS Code adds Cancel, which changes nothing. It replaced
 * Reset's "Uninstall … Too?" with "Keep Datapack adds the new pack alongside", which left the old
 * pack's data in Commerce with the project naming only the new one (live run 8, owner 2026-11-16).
 *
 * @param memory - where the library's pack names are remembered, so both are named as the SC knows them
 * @returns true to go ahead
 */
export async function askSwitchInDialog(project: Project, next: string | undefined, memory?: NameMemory): Promise<boolean> {
    const held = project.datapack;
    if (!held) return true;
    const nameOf = (name: string): string => (memory ? rememberedPackName(memory, name) : undefined) ?? name;
    const old = nameOf(held.name);
    // Only a pack Demo Builder installed has a record of what changed, so only it can save them first.
    const ours = await installedByDemoBuilder(project.path, { name: held.name, version: held.version });
    const verb = next ? 'Switch' : 'Uninstall';
    const detail = [
        next ? `Uninstalls ${old} first, then installs ${nameOf(next)}.` : 'Deletes what it installed in Commerce.',
        ours ? 'Your changes are saved first.' : undefined,
        'Can take several minutes.',
    ].filter(Boolean).join(' ');
    const title = next ? `Switch to ${nameOf(next)}?` : `Uninstall ${old}?`;
    const answer = await vscode.window.showWarningMessage(title, { modal: true, detail }, { title: verb });
    return answer?.title === verb;
}

/** What the SC decided about the datapack, asked before anything runs. */
export interface DatapackPlan {
    /** Whether this Edit changes the datapack at all. */
    changes: boolean;
    /** Whether to remove the old pack's data before the new one is recorded. */
    removeOld: boolean;
}

/**
 * Ask, before anything runs, what to do with the old pack's data. Nothing is
 * asked when the datapack did not change, or the project had none.
 *
 * @param project - the project as it was before the Edit
 * @param changes - the changed choices (`editChanges`)
 * @param ask - the Switch question (`askSwitchInDialog`, in production)
 * @param next - the pack the Edit chose, by library name; undefined for none
 * @returns the plan
 * @throws when the SC cancels: nothing has run
 */
export async function planDatapackChange(
    project: Project,
    changes: readonly string[],
    ask: AskSwitchDatapack,
    next?: string,
): Promise<DatapackPlan> {
    if (!changes.includes('datapack')) return { changes: false, removeOld: false };
    if (!project.datapack) return { changes: true, removeOld: false };
    // Nothing of the old pack to uninstall (never installed here): the new choice is just recorded.
    if (!(await beginSampleDataRemovalCheck(project))) return { changes: true, removeOld: false };
    if (!(await ask(project, next))) throw new Error(CANCELLED);
    return { changes: true, removeOld: true };
}

/**
 * The Edit's line when the old pack's data did not all come out: the datapack part stops, so the
 * old pack stays recorded and nothing is installed over it (step-07 D2, owner Q1). Short, cause
 * first, naming the pack as the SC knows it (owner, 2026-11-14). A removal skipped because no
 * install target was ever recorded keeps nothing back (`noTarget`), so it is nothing to remove.
 *
 * @param name - the old pack's name as the SC knows it
 * @returns the line, or undefined when the Edit may switch the datapack
 */
function datapackNotChanged(removal: DatapackRemoval, name: string): string | undefined {
    const still = `so the datapack is still ${name}`;
    const withWhy = (line: string, why: string | undefined): string => (why ? `${line}: ${why}` : `${line}.`);
    if (removal.leftInStore) return withWhy(`Part of ${name} was left in Commerce, ${still}`, removal.note);
    if (removal.kept === undefined) return undefined;
    if (removal.partly) return withWhy(`Part of ${name} was uninstalled, ${still}`, removal.kept);
    return withWhy(`${name} couldn't be uninstalled, ${still}`, removal.kept);
}

/**
 * Carry out the plan: remove the old pack's data when asked to, record the new
 * choice (which may be none), then the steps creation runs after its import.
 * None of them throws: a project is usable whatever its sample data did, and each
 * step says on the progress line what happened. A removal that did not take all
 * the old data stops here, the old pack still recorded, and the rest of the Edit
 * goes on (owner Q1).
 *
 * @param context - the handler context
 * @param project - the project, as the Edit's other changes left it
 * @param config - what Finish was given
 * @param plan - what the SC decided
 * @param progressTracker - the wizard's progress screen
 * @param storefrontResetFollows - a package change resets the storefront next, and
 *   the reset warms the catalog and writes the category pages itself
 * @returns why the datapack was not changed, for the Edit's warnings; undefined when it was
 */
export async function applyDatapackChange(
    context: HandlerContext,
    project: Project,
    config: ProjectCreationConfig,
    plan: DatapackPlan,
    progressTracker: ProgressTracker,
    storefrontResetFollows = false,
): Promise<string | undefined> {
    if (!plan.changes) return undefined;
    if (plan.removeOld) {
        const report = (stage: string, step?: string) => progressTracker(stage, 90, step ?? '');
        const held = project.datapack?.name ?? '';
        const name = rememberedPackName(context.context.globalState, held) ?? held;
        const removal = await removeProjectSampleDataOutcome(project, context, report, askSaveAsNameWith(vscode));
        const stopped = datapackNotChanged(removal, name);
        if (stopped) return stopped;
    }
    project.datapack = config.datapack;
    // A failed install of the old pack no longer applies (step-04 S7).
    dropStaleFailure(project);
    await context.stateManager.saveProject(project);
    if (!project.datapack) return undefined;
    await executeSampleDataPhase(context, project, progressTracker);
    if (storefrontResetFollows) return undefined;
    await executeCatalogPrewarmPhase(context, project, progressTracker);
    if (!isEdsProject(project)) return undefined;
    // With the old data gone, its categories are too: Reset's removal of the pages
    // Demo Builder wrote comes first, so none is left for a category that no longer
    // exists. With it kept, the old categories still stand and the write only adds.
    if (plan.removeOld) await rewriteCatalogMenuPhase(context, project, progressTracker);
    else await executeCatalogMenuPhase(context, project, progressTracker);
    return undefined;
}
