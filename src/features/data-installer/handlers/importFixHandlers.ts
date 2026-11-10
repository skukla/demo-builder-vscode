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
    if (record.stoppedAt === FINISHING_STOP) return `It stopped after every data type was in, while finishing the import: ${record.reason ?? 'no reason given'}`;
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
        `Importing the datapack ${pack} into the Commerce instance of the Demo Builder project ${projectName ?? 'that is open'} ended with a problem.`,
        ...problems.map((line) => `- ${line}`),
        '',
        "Find the cause with get_datapack_import_status (its skipped rows carry Commerce's reasons) and " +
            'verify_datapack_install. Fix it where it lives: in Commerce with write_commerce_rest, or in ' +
            'the datapack (save_datapack_zip, correct the rows, load_datapack_zip). Then import the pack ' +
            'again with start_datapack_import: data types already in send nothing. Tell me what you ' +
            'found and what you changed.',
    ].join('\n');
}

export const importFixWithAiHandlers = defineHandlers({
    'fix-datapack-import-with-ai': async (context: HandlerContext): Promise<HandlerResponse> => {
        const record = await new TransientStateManager(context.context).get<ImportJobRecord | null>(
            JOB_KEY,
            null,
        );
        const project = await context.stateManager.getCurrentProject();
        const prompt = record ? fixImportPrompt(record, project?.name) : undefined;
        if (!prompt) return { success: false, error: 'The last import has no problem to fix.' };
        await vscode.commands.executeCommand('demoBuilder.openInClaude', { prompt, fresh: true });
        context.logger.info(
            `[Data Installer] Opened Fix with AI on ${record?.datapackName}@${record?.version}`,
        );
        return { success: true };
    },
});
