/**
 * A reset's datapack step as a batch sees it (step-05 S6, owner 2026-11-13): the batch's answers,
 * what the removal did to the store, the row's line for it, and a reset that failed after it. A
 * storefront reset (`edsResetRun`) and a headless one (`projectResetService`) both run the step;
 * the batch row says what it did; the agent's `reset_project` runs it too (S7). Its own file so
 * `edsResetDatapack` keeps only the removal.
 *
 * @module features/eds/services/reset/resetDatapackStep
 */

import { beginSampleDataRemovalCheck, removeProjectSampleDataOutcome, type SaveAsAnswer } from './edsResetDatapack';
import type { ReportStage } from '@/core/vscode/withOperationProgress';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

/**
 * A batch's answers about one project's datapack, given before any reset runs: its Uninstall
 * Datapack box, and the save question's answer for a pack with changes (a name, or `drop`).
 */
export interface AnsweredDatapack {
    removeDatapack: boolean;
    changes?: SaveAsAnswer;
}

/**
 * What a removal did to the store: `kept` is why the data did not all come out (absent when it
 * did), `partly` that some of it came out before it stopped, `unanswered` that nothing came out
 * because the changes in a pack that is not the SC's had no answer (the agent's reset refuses on
 * it, step-05 S7), `leftInStore` that it all ran but left part in the store on purpose (still on the
 * install record, so the project keeps naming the pack; Clear's result says it, step-06 C3), and
 * `note` the engine's line on what it left and why, which a delete that stops names (step-07 D1), and
 * `noTarget` that nothing was removed because the pack has no install record and the project names
 * no website and store view, so nothing can have been installed: nothing to remove, with no `kept`, so Delete, Reset and Edit all
 * carry on with no stop and no line (owner, 2026-11-14), and
 * `savedInto` the SC's own pack the changes were saved into first, by its name, which the run's
 * row says (owner, 2026-11-14: with the setting on and no save window, nothing else does).
 */
export interface DatapackRemoval {
    kept?: string;
    partly?: boolean;
    unanswered?: true;
    leftInStore?: true;
    note?: string;
    noTarget?: true;
    savedInto?: string;
}

/**
 * Uninstall Datapack as answered up front (a batch's box, or the agent's `removeData`): only when
 * ticked and the project has a pack and a Commerce backend; the changes settled with the answer,
 * given, so nothing is dropped that was not answered for. Every reset door runs it, so the window
 * and the agent do the same work.
 *
 * @returns what the removal did, or undefined when there was none to do: a project with no install
 *   target recorded has nothing installed, so its row and the agent's answer say nothing of it
 */
export async function removeAnsweredDatapack(
    project: Project,
    context: HandlerContext,
    report: ReportStage,
    answered: AnsweredDatapack | undefined,
): Promise<DatapackRemoval | undefined> {
    if (answered?.removeDatapack !== true || (await beginSampleDataRemovalCheck(project)) !== true) return undefined;
    const removal = await removeProjectSampleDataOutcome(project, context, report, { given: answered.changes });
    return removal.noTarget ? undefined : removal;
}

/** A reset row's line for what its datapack step did to the store. */
export function datapackStepLine(removal: DatapackRemoval): string {
    // Part left in Commerce on purpose, named in the engine's note (review, 2026-11-14).
    if (removal.leftInStore) {
        const left = 'Part of its datapack was left in Commerce';
        return removal.note ? `${left}: ${removal.note}` : `${left}.`;
    }
    if (removal.kept === undefined) return 'Its datapack was uninstalled.';
    if (removal.partly) return `Part of its datapack was uninstalled: ${removal.kept}`;
    return `Its datapack was not uninstalled: ${removal.kept}`;
}

/** A run row's line for a save into the SC's own pack first: "Saved to My Luma.". */
export function savedIntoLine(removal: DatapackRemoval | undefined): string | undefined {
    return removal?.savedInto ? `Saved to ${removal.savedInto}.` : undefined;
}

/** Whether a finished reset's row says what its datapack step did: not when it all came out. */
export function datapackLeftSomething(removal: DatapackRemoval | undefined): removal is DatapackRemoval {
    return removal !== undefined && (removal.kept !== undefined || removal.leftInStore === true);
}

/**
 * A reset that threw after its datapack step ran: the same failure, in the same words, carrying
 * what the step did, so the batch row can say what became of the store (review, 2026-11-13), and
 * the content-kept line when the demo's pages could not be reached (review, 2026-11-14).
 */
export class FailedAfterDatapack extends Error {
    constructor(
        cause: unknown,
        readonly removal: DatapackRemoval,
        readonly contentKept?: string,
    ) {
        super(cause instanceof Error ? cause.message : String(cause));
        this.name = 'FailedAfterDatapack';
    }

    /** The lines a row says under the failure: what the datapack step did, then the kept content. */
    lines(): string[] {
        return [datapackStepLine(this.removal), ...(this.contentKept ? [this.contentKept] : [])];
    }
}
