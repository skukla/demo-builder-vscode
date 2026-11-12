/**
 * Fix with AI on an import that ended with a problem (owner, 2026-11-07): the import window's
 * main action when Retry cannot help. It opens the SC's chosen AI in a new chat with a prompt
 * naming the pack, the project and each problem, the way the Updates window hands a storefront
 * clash to it (`features/updates/services/fixWithAi.ts`). The agent then reads the cause, fixes the
 * store or the pack, and imports again, through the tools the prompt names; every store write
 * asks the SC first.
 *
 * The prompt is built from the job the extension recorded, never from the window: what the agent
 * is told is what happened.
 *
 * Dry Run Found a Problem has the same button (step 03, S5): the request says `from: 'dry-run'`,
 * and the prompt is built from the dry run's recorded answer (`recordDryRun`), the datapack, its
 * version and the reason, the same reason `validate_datapack_import` answers an agent with.
 *
 * @module features/data-installer/handlers/importFixHandlers
 */

import * as vscode from 'vscode';
import { FINISHING_STOP, type ImportJobRecord } from '../types';
import { dataTypeLabel } from '../ui/dataTypeLabel';
import { JOB_KEY } from './importJobWatch';
import { TransientStateManager } from '@/core/state/transientStateManager';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

/** Where the import stopped and why, when it did. */
function stoppedLine(record: ImportJobRecord): string | undefined {
    if (record.stoppedAt === FINISHING_STOP) return `It stopped after every data type was in, while finishing the install: ${record.reason ?? 'no reason given'}`;
    if (record.stoppedAt) return `It stopped at ${dataTypeLabel(record.stoppedAt)}: ${record.reason ?? 'no reason given'}`;
    if (record.reason) return `It stopped before any data type: ${record.reason}`;
    return undefined;
}

/** The import's problems as lines: where it stopped and why, then each data type's own. */
function problemLines(record: ImportJobRecord): string[] {
    const rows = Object.entries(record.rowNotes ?? {}).map(([kind, note]) => `${dataTypeLabel(kind)}: ${note}`);
    const stopped = stoppedLine(record);
    return stopped ? [stopped, ...rows] : rows;
}

/**
 * The prompt for the agent, or undefined when the record has no problem to fix.
 *
 * @param projectName - the open project, which every datapack tool acts on
 */
export function fixImportPrompt(
    record: ImportJobRecord,
    projectName: string | undefined,
): string | undefined {
    const problems = problemLines(record);
    if (problems.length === 0) return undefined;
    const pack = `${record.datapackName}@${record.version}`;
    return [
        `Installing the datapack ${pack} into the Commerce instance of the Demo Builder project ${projectName ?? 'that is open'} ended with a problem.`,
        ...problems.map((line) => `- ${line}`),
        '',
        "Find the cause with get_datapack_import_status (its skipped rows carry Commerce's reasons) and " +
            'verify_datapack_install. Fix it where it lives: in Commerce with write_commerce_rest, or in ' +
            'the datapack (save_datapack_zip, correct the rows, load_datapack_zip). Then install the datapack ' +
            'again with start_datapack_import: data types already in send nothing. Tell me what you ' +
            'found and what you changed.',
    ].join('\n');
}

/** Where the last dry run's answer is recorded. One per extension host; a later dry run replaces it. */
export const DRY_RUN_KEY = 'dataInstaller.import.dryRun';

/** A dry run's answer, as the extension recorded it. */
export interface DryRunRecord {
    datapackName: string;
    version: string;
    valid: boolean;
    reason?: string;
}

/** Records a dry run's answer, or clears it (null) when the check could not run. */
export async function recordDryRun(
    context: HandlerContext,
    answer: DryRunRecord | null,
): Promise<void> {
    await new TransientStateManager(context.context).set(DRY_RUN_KEY, answer);
}

/**
 * The prompt for a dry run that found a problem, or undefined when it found none. It never asks
 * for an install: the SC decides that once the dry run passes.
 *
 * @param projectName - the open project, which every datapack tool acts on
 */
export function fixDryRunPrompt(
    record: DryRunRecord,
    projectName: string | undefined,
): string | undefined {
    if (record.valid || !record.reason) return undefined;
    const pack = `${record.datapackName}@${record.version}`;
    return [
        `A Dry Run of installing the datapack ${pack} into the Commerce instance of the Demo Builder project ${projectName ?? 'that is open'} found a problem.`,
        `- ${record.reason}`,
        '',
        'Fix the datapack: save_datapack_zip, correct the rows, load_datapack_zip. Then run ' +
            'validate_datapack_import again. Tell me what you found, what you changed, and what ' +
            'the Dry Run says now. Do not install the datapack until I ask you to.',
    ].join('\n');
}

/** The prompt the request asks for: the dry run's, or the last install's. */
async function promptFor(
    context: HandlerContext,
    fromDryRun: boolean,
): Promise<{ prompt?: string; pack?: string; refusal: string }> {
    const state = new TransientStateManager(context.context);
    const project = await context.stateManager.getCurrentProject();
    if (fromDryRun) {
        const dry = await state.get<DryRunRecord | null>(DRY_RUN_KEY, null);
        return {
            prompt: dry ? fixDryRunPrompt(dry, project?.name) : undefined,
            pack: `${dry?.datapackName}@${dry?.version}`,
            refusal: 'The last Dry Run found no problem to fix.',
        };
    }
    const record = await state.get<ImportJobRecord | null>(JOB_KEY, null);
    return {
        prompt: record ? fixImportPrompt(record, project?.name) : undefined,
        pack: `${record?.datapackName}@${record?.version}`,
        refusal: 'The last install has no problem to fix.',
    };
}

export const importFixWithAiHandlers = defineHandlers({
    // Only `from` is read from the request: everything the prompt says comes from a record.
    'fix-datapack-import-with-ai': async (
        context: HandlerContext,
        payload?: { from?: unknown },
    ): Promise<HandlerResponse> => {
        const { prompt, pack, refusal } = await promptFor(context, payload?.from === 'dry-run');
        if (!prompt) return { success: false, error: refusal };
        await vscode.commands.executeCommand('demoBuilder.openInClaude', { prompt, fresh: true });
        context.logger.info(`[Data Installer] Opened Fix with AI on ${pack}`);
        return { success: true };
    },
});
