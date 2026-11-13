/**
 * The reset's optional sample-data step: whether the project's datapack can be
 * removed (checked early, answered late), the question, and the removal itself,
 * which reports rather than throws.
 *
 * Extracted from `edsResetUI` (EDS-8, 2026-10-08) so that file keeps only the
 * reset door's orchestration.
 *
 * @module features/eds/services/reset/edsResetSampleData
 */

import type { DatapackRemoval } from './resetDatapackStep';
import { createNonSwitchingStateManager } from '@/core/state/workingProjectStateManager';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { askForDetailsDuringOperation, modalIsAsking } from '@/core/vscode/operationPrompt';
import type { ReportStage } from '@/core/vscode/withOperationProgress';
import { saveFirstLabel, UNINSTALL_DATAPACK, withoutSavingLabel } from '@/features/data-installer/datapackWords';
import { installedByDemoBuilder } from '@/features/data-installer/services/buildDatapackEngine';
import { commerceBackendOf } from '@/features/data-installer/services/commerceBackend';
import { typesLine } from '@/features/data-installer/services/datapackTypesLine';
import { dropStaleFailure } from '@/features/data-installer/services/installFailure';
import { rememberedPackName, type NameMemory } from '@/features/data-installer/services/packNames';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext } from '@/types/handlers';

/**
 * Can this project's sample data actually be removed? Started early, awaited late.
 *
 * Returns undefined when there is no pack — nothing to ask about. Otherwise it
 * resolves true when the project has a Commerce backend to remove the pack from.
 *
 * It used to resolve the project's Commerce credentials, which was the slow part of
 * the reset dialog. The Data Installer service stopped accepting a caller's
 * credentials on purpose (DEMOSYS-1698) and signs in with its own, so a project with
 * no saved pair can be cleaned like any other (DI-6, 2026-10-28). The Promise shape
 * stays because both callers hold it across a modal. **Never rejects.**
 *
 * Checked BEFORE the prompt rather than during the reset. Measured live
 * 2026-08-16: the reset once asked, ran the full ~3-minute storefront reset, and only
 * then reported it could not remove anything.
 */
export function beginSampleDataRemovalCheck(project: Project): Promise<boolean> | undefined {
    if (!project.datapack) {
        return undefined;
    }
    return Promise.resolve(commerceBackendOf(project) !== undefined);
}

/**
 * Ask whether to remove the imported sample data, when there is any to remove.
 *
 * ONE question with one action. A restore (remove, then import the same pack
 * again) was offered here for part of a day and taken out before release: it
 * roughly tripled the tail of an already three-minute operation, and it made
 * "reset" mean two different things depending on a button. Reset means what it
 * has always meant — put the storefront back, and optionally clear the data.
 *
 * Opt IN: anything other than the explicit button keeps the data. Someone
 * resetting code must not lose a catalog by pressing Escape, which is why the
 * dismissal path and the "keep" path are the same path.
 *
 * The duration is in the prompt because it is the surprising part — a six-type
 * removal was measured at 470 seconds, so a modal that says "this is quick" by
 * omission would be lying.
 *
 * Reset asks it, and so does an Edit that changes the datapack (PL-75), which adds what Keep
 * Datapack does there. The question names the pack as the SC knows it, never its id, and the body
 * holds only the sentences true for this pack (review, 2026-11-10: it showed
 * "my-luma@20261109-141504" in one long sentence).
 *
 * @param words.memory - where the library's pack names are remembered (`packNames`)
 * @param words.closing - a last sentence for this door
 */
export async function confirmSampleDataRemoval(
    project: Project,
    vscode: typeof import('vscode'),
    canRemove: Promise<boolean> | undefined,
    words: { memory?: NameMemory; closing?: string } = {},
): Promise<boolean> {
    // One condition, not a guard and then an await: `canRemove` is undefined
    // exactly when `datapack` is (the check above gates on the same field), so a
    // separate `!canRemove` test could never be the deciding one.
    const { datapack } = project;
    if (!datapack || !(await canRemove)) {
        return false;
    }

    const removeButton: import('vscode').MessageItem = { title: UNINSTALL_DATAPACK };
    // `isCloseAffordance` REPLACES the modal's automatic "Cancel" button.
    // "Cancel" here read as "abort the whole reset" when it actually meant
    // "keep the data and continue" (user-reported 2026-08-23) — this question
    // is a yes/no about the datapack only, and its buttons now say so. Esc
    // maps to Keep Datapack: dismissal takes the safe branch.
    const keepButton: import('vscode').MessageItem = { title: 'Keep Datapack', isCloseAffordance: true };
    // "anything you added by hand stays": pack-scoped removal confirmed by the
    // Data Installer service owner 2026-08-22 — a removal takes only what the
    // pack imported, so the reassurance is a fact, not a guess (backlog item
    // 2026-08-17-what-does-a-datapack-removal-actually-delete, now archived).
    // Only a pack Demo Builder installed has a record of what changed, so only it can say the next part.
    const ours = await installedByDemoBuilder(project.path, { name: datapack.name, version: datapack.version });
    const name = words.memory ? rememberedPackName(words.memory, datapack.name) : undefined;
    const detail = [
        'Deletes what it installed in Commerce.',
        ours ? 'Your changes are saved first.' : undefined,
        'Can take several minutes.',
        words.closing,
    ].filter(Boolean).join(' ');
    const answer = await vscode.window.showWarningMessage(
        `Uninstall ${name ?? 'the Datapack'} Too?`,
        { modal: true, detail },
        removeButton,
        keepButton,
    );
    return answer?.title === removeButton.title;
}

/**
 * Restore it — remove, then import the same pack again — reporting rather than
 * throwing.
 *
 * The storefront reset is the thing the user asked for, so no outcome here may
 * turn a good reset into a failed one. Everything is a log line.
 *
 * **Reported at three levels, because they mean different things.** A clean
 * restore says nothing. A refusal (no credentials, no pack, nothing stored) is a
 * warning. Data removed and NOT reinstalled is an ERROR: the instance is now
 * empty, which is a worse state than the user started in and the one case where
 * they must go and do something about it.
 */
/**
 * The SC's answer about their changes, when the demo's pack is not theirs: a name to save them as
 * a new datapack of theirs (Save As), losing them, or no answer, which keeps the data where it is.
 */
export type SaveAsAnswer = { saveAs: string } | 'drop' | undefined;

/**
 * Asks it. The name is required: losing the changes is its own answer, never an empty name (owner,
 * 2026-11-04), as in Create Datapack and the Datapacks screen's removal. The reset's own question
 * was already asked.
 */
export type AskSaveAsName = (asked: { sentence?: string }) => Promise<SaveAsAnswer>;

/**
 * The answer given before anything runs: a batch's save question (step-05 S1, J7-2). It goes with
 * the first read, so a `drop` or a new name reaches the SC's own pack too, which `AskSaveAsName`
 * is never asked about (their pack is saved into without a question). Absent: as no answer.
 */
export interface GivenSaveAs {
    given: SaveAsAnswer;
}

/** How a removal's changes question is answered: asked when it comes up, or given up front. */
export type SaveAsAnswering = AskSaveAsName | GivenSaveAs;

/** The given answer as the removal's request carries it. */
function requestOfGiven(given: SaveAsAnswer): { answer?: 'drop' | 'keep'; saveAs?: { displayName: string } } {
    if (given === undefined) return {};
    return given === 'drop' ? { answer: 'drop' } : { answer: 'keep', saveAs: { displayName: given.saveAs } };
}

/** The answering as a question to ask: a given answer is that answer, already chosen. */
function askerOf(answering: SaveAsAnswering | undefined): AskSaveAsName | undefined {
    if (answering === undefined || typeof answering === 'function') return answering;
    return () => Promise.resolve(answering.given);
}

/**
 * The SC's changes, before the reset removes the pack: saved into the demo's pack when it is
 * theirs, else as a new pack under the name `askName` gets (Save As, owner 2026-11-03), else lost.
 * A save that fails removes nothing.
 *
 * @returns why the pack must stay (marked when it was for want of an answer), or undefined when it may go
 */
async function settleBeforeReset(
    project: Project,
    context: HandlerContext,
    report: ReportStage,
    answering: SaveAsAnswering | undefined,
): Promise<DatapackRemoval | undefined> {
    const datapack = project.datapack;
    if (!datapack) return undefined;
    const { contextForProject, settleChangesBeforeRemoval } = await import('@/features/data-installer/handlers/removalChanges');
    const forProject = contextForProject(context, project);
    const request = {
        pack: { name: datapack.name, version: datapack.version },
        ...(datapack.store ? { source: datapack.store } : {}),
        unanswered: 'keep' as const,
    };
    const given = answering !== undefined && typeof answering !== 'function' ? requestOfGiven(answering.given) : {};
    let settled = await settleChangesBeforeRemoval(forProject, { ...request, ...given }, (stage) => report(stage));
    // A given answer was already sent; only an unanswered read asks.
    const askName = given.answer === undefined ? askerOf(answering) : undefined;
    if ('response' in settled && settled.response.code === ErrorCode.CHANGES_NEED_ANSWER && askName) {
        const asked = settled.response.data as { sentence?: string } | undefined;
        const chosen = await askName(asked?.sentence ? { sentence: asked.sentence } : {});
        if (chosen === undefined) {
            context.logger.info('[EdsReset] Sample data kept: the changes in it were not answered.');
            const kept = asked?.sentence ? `${asked.sentence} They were not answered.` : 'The changes in it were not answered.';
            return { kept, unanswered: true };
        }
        const answer = chosen === 'drop' ? { answer: 'drop' as const } : { answer: 'keep' as const, saveAs: { displayName: chosen.saveAs } };
        settled = await settleChangesBeforeRemoval(forProject, { ...request, ...answer }, (stage) => report(stage));
    }
    if ('response' in settled) {
        const reason = settled.response.error ?? 'Its changes could not be saved.';
        context.logger.error(`[EdsReset] Sample data was NOT removed: ${reason}`);
        return { kept: reason };
    }
    return undefined;
}

/**
 * Remove the project's datapack data, its changes settled first (`settleBeforeReset`), reporting
 * rather than throwing. A reset ignores the answer; a project delete stops on it, since deleting the
 * project would leave the data with no record (walk F96). A removal that took everything clears
 * the project's pack (`forgetRemovedPack`); one that left part in the store on purpose keeps it.
 *
 * @returns why the data was not all removed, or undefined when it was
 */
export async function removeProjectSampleData(
    project: Project,
    context: HandlerContext,
    report: ReportStage,
    askName?: SaveAsAnswering,
): Promise<string | undefined> {
    return (await removeProjectSampleDataOutcome(project, context, report, askName)).kept;
}

/** Whether any data type came out of the store before a removal stopped. */
function anyRemoved(perType: Record<string, string> | undefined): boolean {
    return Object.values(perType ?? {}).some((status) => status === 'success');
}

/**
 * The same removal, saying also whether part of the data came out before it stopped, for a reset
 * row to say what happened to the store (review, 2026-11-13). `alsoLeaving` is Clear Demo Data's:
 * products its wipe deletes right after, whose holds count as going.
 *
 * @returns why the data was not all removed and whether some was, or `{}` when it all was
 */
export async function removeProjectSampleDataOutcome(
    project: Project,
    context: HandlerContext,
    report: ReportStage,
    askName?: SaveAsAnswering,
    alsoLeaving?: readonly string[],
): Promise<DatapackRemoval> {
    try {
        // The SC's changes first: this door's question was already asked, and keeping the work is
        // the likely intent. Reported, as everything here is: a save that fails removes nothing and
        // the reset stands.
        if (project.datapack) {
            const kept = await settleBeforeReset(project, context, report, askName);
            if (kept) return kept;
        }

        report(OPERATION_STAGES.removingDatapack.label);

        const { removeSampleData } = await import(
            '@/features/data-installer/services/sampleDataInstall'
        );
        const { buildSampleDataDeps } = await import(
            '@/features/data-installer/services/sampleDataInstallDeps'
        );

        // The mode phrases the progress line; the poller's per-phase label comes
        // from the runner, which knows which half of a restore is running.
        const result = await removeSampleData(
            project,
            buildSampleDataDeps(
                context,
                project,
                // The count of types is the line under the step, never its position.
                (sd) => report(OPERATION_STAGES.removingDatapack.label, typesLine(sd.done, sd.total, sd.processing)),
                'remove',
            ),
            // Clear Demo Data's: the products its wipe deletes next count as going (step-06 C3 re-review).
            ...(alsoLeaving ? [{ alsoLeaving: [...alsoLeaving] }] : []),
        );

        if (result.ran && result.outcome !== 'success') {
            context.logger.error(
                `[EdsReset] Sample data was NOT removed: ${result.reason ?? 'no reason given'}`,
            );
            const kept = result.reason ?? 'The datapack was not all uninstalled.';
            return anyRemoved(result.perType) ? { kept, partly: true } : { kept };
        }
        if (!result.ran) {
            context.logger.warn(
                `[EdsReset] Sample data was not removed: ${result.reason ?? 'no reason given'}`,
            );
            return { kept: result.reason ?? 'The datapack was not uninstalled.' };
        }
        // Part left in the store on purpose: the record still describes what Commerce holds.
        if (result.leftInStore) return { leftInStore: true };
        await forgetRemovedPack(project, context);
        return {};
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        context.logger.warn(`[EdsReset] Sample data removal failed, reset stands: ${reason}`);
        return { kept: reason };
    }
}

/**
 * A removal that took everything: the project stops naming the pack, by the Datapacks screen's
 * Uninstall's rule (`settleProjectAfterJob` in `importJobWatch.ts`). Without it a reset left the
 * project naming a pack Commerce no longer held (step-05 R1).
 *
 * On the object this was handed: a reset's `finally` saves the object it holds (`edsResetUI.ts`),
 * so a clear on another copy would be written back over. Saved without making it the open project,
 * since a batch's rows are not (`createNonSwitchingStateManager`). Never fatal: the data is out of
 * Commerce either way, and a delete reads this module's answer to decide whether the files may go.
 * Clear Demo Data uses it too, for a pack the service installed that its wipe took out whole
 * (step-06 C3 review), and reads whether the save went through.
 *
 * @returns whether the project was saved without the pack
 */
export async function forgetRemovedPack(project: Project, context: HandlerContext): Promise<boolean> {
    project.datapack = undefined;
    dropStaleFailure(project);
    try {
        await createNonSwitchingStateManager(context.stateManager).saveProject(await withoutPackOnDisk(project, context));
        return true;
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        context.logger.warn(`[EdsReset] The datapack was uninstalled; the project could not be saved without it: ${reason}`);
        return false;
    }
}

/**
 * What to save once a pack is forgotten. The open project: the object handed, which its screens and
 * a reset's `finally` hold. Any other: its manifest as it is on disk NOW, with only its pack cleared,
 * since a copy loaded earlier (Clear Commerce Instance loads every project before its removals, step
 * 06 C4 review) would write back whatever it held. Falls back to the object handed when it cannot be read.
 */
async function withoutPackOnDisk(project: Project, context: HandlerContext): Promise<Project> {
    const current = await context.stateManager.getCurrentProject();
    if (current?.path === project.path) return project;
    const fresh = await context.stateManager.loadProjectFromPath(project.path, undefined, { persistAfterLoad: false });
    if (!fresh) return project;
    fresh.datapack = undefined;
    dropStaleFailure(fresh);
    return fresh;
}

/** The answers, in the Datapacks screen's save question's words (`SaveFirstWindow`). */
const SAVE = saveFirstLabel('Uninstall', true);
const DROP = withoutSavingLabel('Uninstall');
const NAME_LABEL = 'Save Changes As';
const NAME_REQUIRED = 'Datapack name is required';

/**
 * In the reset's progress window: the name field, empty as Create Datapack's starts, and both
 * answers; an empty name is asked again.
 */
async function askInWindow(sentence: string | undefined): Promise<SaveAsAnswer> {
    let value = '';
    let missing = false;
    for (;;) {
        const answer = await askForDetailsDuringOperation({
            message: sentence ?? '',
            fields: [{ id: 'name', label: NAME_LABEL, value, ...(missing ? { description: NAME_REQUIRED } : {}) }],
            actions: [SAVE, DROP],
        });
        if (answer.action === DROP) return 'drop';
        if (answer.action !== SAVE) return undefined;
        const name = (answer.values.name ?? '').trim();
        if (name) return { saveAs: name };
        value = answer.values.name ?? '';
        missing = true;
    }
}

/** With no window to ask in: the two answers, then the name, which the box will not take empty. */
async function askInDialogs(vscode: typeof import('vscode'), sentence: string | undefined): Promise<SaveAsAnswer> {
    const chosen = await vscode.window.showWarningMessage(sentence ?? NAME_LABEL, { modal: true }, SAVE, DROP);
    if (chosen === DROP) return 'drop';
    if (chosen !== SAVE) return undefined;
    const name = await vscode.window.showInputBox({
        title: NAME_LABEL,
        ignoreFocusOut: true,
        validateInput: (typed) => (typed.trim() ? undefined : NAME_REQUIRED),
    });
    return name?.trim() ? { saveAs: name.trim() } : undefined;
}

/**
 * The reset's Save As question: in its progress window when one is open, else in VS Code's dialogs.
 *
 * @param vscode - the VS Code API
 */
export function askSaveAsNameWith(vscode: typeof import('vscode')): AskSaveAsName {
    return ({ sentence }) => (modalIsAsking() ? askInWindow(sentence) : askInDialogs(vscode, sentence));
}
