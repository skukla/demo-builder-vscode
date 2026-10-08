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

import type { ReportStage } from '@/core/vscode/withOperationProgress';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

/**
 * Can this project's sample data actually be removed? Started early, awaited late.
 *
 * Answering needs a Commerce credential, and getting one is the slow part of this
 * dialog — not the HTTP call (130-230ms measured) but the IMS token behind it,
 * which `tokenManager.inspectToken` reads by spawning the whole `aio` CLI when its
 * inspection cache is cold. Kicking it off before the reset confirmation spends
 * that time against a dialog the user is already reading.
 *
 * Returns undefined when there is no pack — nothing to ask about, so nothing to
 * spend. **Never rejects**: this is held unawaited across a modal, where a
 * rejection would surface as an unhandled promise rather than as a failed reset.
 *
 * Checked BEFORE the prompt rather than during the reset. Measured live
 * 2026-08-16: this asked, ran the full ~3-minute storefront reset, and only then
 * reported "no usable Commerce credentials" — three minutes spent on a question
 * that could not be honoured. The original gate was `datapack` alone, justified by
 * "no network call in front of a modal"; that rule was really about not adding
 * failure modes, and a bounded GET that degrades silently removes one.
 */
export function beginSampleDataCredentialCheck(
    project: Project,
    context: HandlerContext,
): Promise<boolean> | undefined {
    if (!project.datapack) {
        return undefined;
    }

    // Through the shared resolver, which owns the `stackBackend` mapping. This
    // site passed a raw Project through `as never`, so the dispatch matched
    // neither backend and the prompt never appeared for any project — see
    // `resolveProjectCredentials` for the three sites that made that mistake.
    return (async () => {
        const { resolveProjectCredentials } = await import(
            '@/features/data-installer/services/commerceCredentialBroker'
        );
        const credentials = await resolveProjectCredentials(context, project);
        return credentials.ok;
    })().catch(() => false);
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
 */
export async function confirmSampleDataRemoval(
    project: Project,
    vscode: typeof import('vscode'),
    canRemove: Promise<boolean> | undefined,
): Promise<boolean> {
    // One condition, not a guard and then an await: `canRemove` is undefined
    // exactly when `datapack` is (the check above gates on the same field), so a
    // separate `!canRemove` test could never be the deciding one.
    const { datapack } = project;
    if (!datapack || !(await canRemove)) {
        return false;
    }

    const removeButton: import('vscode').MessageItem = { title: 'Remove Datapack' };
    // `isCloseAffordance` REPLACES the modal's automatic "Cancel" button.
    // "Cancel" here read as "abort the whole reset" when it actually meant
    // "keep the data and continue" (user-reported 2026-08-23) — this question
    // is a yes/no about the datapack only, and its buttons now say so. Esc
    // maps to Keep Data: dismissal takes the safe branch.
    const keepButton: import('vscode').MessageItem = { title: 'Keep Data', isCloseAffordance: true };
    // "anything you added by hand stays": pack-scoped removal confirmed by the
    // Data Installer service owner 2026-08-22 — a removal takes only what the
    // pack imported, so the reassurance is a fact, not a guess (backlog item
    // 2026-08-17-what-does-a-datapack-removal-actually-delete, now archived).
    const answer = await vscode.window.showWarningMessage(
        `Also remove the datapack this project imported (${datapack.name}@${datapack.version})? ` +
            'This deletes the data this pack imported from the Commerce instance — ' +
            'anything you added by hand stays — and can take several minutes. ' +
            'Resetting the storefront does not require it.',
        { modal: true },
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
export async function removeProjectSampleData(
    project: Project,
    context: HandlerContext,
    report: ReportStage,
): Promise<void> {
    try {
        report('Removing the sample data');

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
                (sd) =>
                    report(
                        'Removing the sample data',
                        sd.processing.length > 0 ? sd.processing.join(', ') : undefined,
                        { index: sd.done, total: sd.total },
                    ),
                'remove',
            ),
        );

        if (result.ran && result.outcome !== 'success') {
            context.logger.error(
                `[EdsReset] Sample data was NOT removed: ${result.reason ?? 'no reason given'}`,
            );
            return;
        }
        if (!result.ran) {
            context.logger.warn(
                `[EdsReset] Sample data was not removed: ${result.reason ?? 'no reason given'}`,
            );
        }
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        context.logger.warn(`[EdsReset] Sample data removal failed, reset stands: ${reason}`);
    }
}
