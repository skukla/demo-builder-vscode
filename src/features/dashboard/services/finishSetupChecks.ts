/**
 * The Check of the project's Republish the Code step (PL-101): whether the live site serves the
 * files the run left as the repository has them now. Reads only (`codeServedNow`): a Check never
 * publishes. Shared by the Finish Setup guide's Check and by Republish, which checks the step
 * once its publish finishes so the step turns done.
 *
 * The record after the check follows the setup guide's rule (`setupStepRecords.ts`): a pass marks
 * the step done, a fail opens it, a check that could not tell leaves the state as it was.
 *
 * @module features/dashboard/services/finishSetupChecks
 */

import { outcomeOf, stateAfterCheck } from './setupStepRecords';
import { codeServedNow } from '@/features/eds/services/storefront/codeServed';
import { REPUBLISH_CODE_STEP } from '@/features/eds/services/storefront/codeStepRecord';
import type { FinishSetupRecord, Project } from '@/types/base';
import { getEdsGithubRepo } from '@/types/typeGuards';

/** The repository reads the check needs, handed in by the handler (ADR-015). */
export type CodeStepReads = Parameters<typeof codeServedNow>[0];

/** What the check found: done, not done, or it could not tell; and why, in the SC's words. */
interface CodeCheck {
    done?: boolean;
    note: string;
}

/** The check against the live site, as a conclusion and a sentence. Never throws. */
async function checkFiles(
    project: Project,
    files: readonly string[],
    reads: CodeStepReads,
): Promise<CodeCheck> {
    const [owner, repo] = (getEdsGithubRepo(project) ?? '').split('/');
    if (!owner || !repo) return { note: 'This project has no storefront repository to check.' };
    try {
        const missing = await codeServedNow(reads, { owner, repo }, files);
        if (missing.length === 0)
            return { done: true, note: 'The live site serves the code as the repository has it.' };
        return {
            done: false,
            note: `The live site still does not serve ${missing.join(', ')} as the repository has it.`,
        };
    } catch (error) {
        return {
            note: `Demo Builder could not check the live site: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

/**
 * Check the project's Republish the Code step and answer the project with the step's record as the
 * check leaves it. The caller saves it.
 *
 * @returns the project with the checked record, or undefined when the project has no such step
 */
export async function checkCodeStep(
    project: Project,
    reads: CodeStepReads,
): Promise<Project | undefined> {
    const record = project.finishSetup?.[REPUBLISH_CODE_STEP];
    if (!record?.files?.length) return undefined;
    const found = await checkFiles(project, record.files, reads);
    const { state: previous, ...kept } = record;
    const state = stateAfterCheck(previous, found.done);
    const checked: FinishSetupRecord = {
        ...kept,
        ...(state ? { state } : {}),
        note: found.note,
        lastCheck: outcomeOf(found.done),
        checkedAt: new Date().toISOString(),
    };
    return { ...project, finishSetup: { ...project.finishSetup, [REPUBLISH_CODE_STEP]: checked } };
}
