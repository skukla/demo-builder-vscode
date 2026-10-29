/**
 * What the SC's AI is asked when they choose Fix with AI on a clashing update (EDS-57 step 4).
 *
 * Engine-neutral: it names files, diffs and a Demo Builder tool, never an agent. It carries
 * everything the merge needs, so the agent does not have to rediscover it: where the copy
 * is, which files clash, and for each what the update changed and what the storefront
 * changed, both from where they started. The rules are the ones the finish checks enforce
 * (only these files, no markers left), plus the one it cannot: the agent never commits or
 * pushes, because finishing is what checks the fix, pushes it and records the version.
 *
 * @module features/updates/services/clashPrompt
 */

import * as path from 'path';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { LocalCopy } from '@/features/updates/services/localStorefrontRefresh';
import type { PendingClash } from '@/features/updates/services/pendingClash';
import type { Project } from '@/types/base';

/** Longest diff put in the prompt, in lines; a longer one is cut and says so. */
const DIFF_LINES = 150;

/** One clashing file: what each side changed from where both started. */
export interface ClashFile {
    path: string;
    updateDiff: string;
    storefrontDiff: string;
}

/** One project's kept clash, ready to describe. */
export interface ClashForPrompt {
    title: string;
    projectName: string;
    clash: PendingClash;
    storefrontPath: string;
    files: ClashFile[];
}

/** A diff no longer than the prompt allows; a longer one is cut and says so. */
export function boundDiff(diff: string): string {
    const lines = diff.trimEnd().split('\n');
    if (lines.length <= DIFF_LINES) return lines.join('\n');
    return [...lines.slice(0, DIFF_LINES), `… ${lines.length - DIFF_LINES} more lines; read the file itself`].join('\n');
}

/** Each clashing file's two diffs, read from the local copy (both commits were fetched into it). */
export async function clashFiles(copy: LocalCopy, clash: PendingClash): Promise<ClashFile[]> {
    const files: ClashFile[] = [];
    for (const file of clash.files) {
        const update = await copy.git(`git diff ${clash.base} ${clash.target} -- "${file}"`, TIMEOUTS.NORMAL);
        const storefront = await copy.git(`git diff ${clash.base} HEAD -- "${file}"`, TIMEOUTS.NORMAL);
        files.push({ path: file, updateDiff: boundDiff(update.stdout), storefrontDiff: boundDiff(storefront.stdout) });
    }
    return files;
}

/** One project's clash, gathered: the record, the copy and the diffs. */
export async function clashForPrompt(project: Project, clash: PendingClash, copy: LocalCopy): Promise<ClashForPrompt> {
    return {
        title: getProjectDisplayName(project),
        projectName: project.name,
        clash,
        storefrontPath: copy.storefrontPath,
        files: await clashFiles(copy, clash),
    };
}

function describeUpdate({ clash }: ClashForPrompt): string {
    const range = `${clash.base.slice(0, 7)} to ${clash.target.slice(0, 7)}`;
    const repo = `${clash.source.owner}/${clash.source.repo}`;
    return clash.track === 'boilerplate'
        ? `Adobe's tested boilerplate (${repo}, ${range})`
        : `the changes from ${repo} (${range})`;
}

function describeOne(item: ClashForPrompt): string {
    const fileBlocks = item.files.map((file) => [
        `### ${file.path}`,
        `Full path: ${path.join(item.storefrontPath, file.path)}`,
        '',
        "What the update changed (from where both started):",
        '```diff', file.updateDiff || '(no change)', '```',
        '',
        "What the storefront changed (someone's edits, from the same start):",
        '```diff', file.storefrontDiff || '(no change)', '```',
    ].join('\n'));
    return [
        `## ${item.title} (project "${item.projectName}")`,
        '',
        `The update brings in ${describeUpdate(item)}. Demo Builder applied it in the project's local copy of the ` +
            `storefront, ${item.storefrontPath}, and left the clash there. The rest of the update is already in place.`,
        '',
        `Fix only ${item.files.length === 1 ? 'this file' : 'these files'}:`,
        ...item.files.map((file) => `- ${file.path}`),
        '',
        ...fileBlocks,
        '',
        `When it is fixed, call the Demo Builder tool finish_storefront_update with project "${item.projectName}": ` +
            'once without confirm to check it, then with confirm:true. It checks the fix, pushes it to the storefront ' +
            'and records the update. If you cannot fix it, call it with leave:true and confirm:true, which drops the fix.',
    ].join('\n');
}

/** The prompt for one or more kept clashes. */
export function buildClashPrompt(items: ClashForPrompt[]): string {
    return [
        `A storefront update stopped because it clashes with edits in the storefront. Please fix the clash${items.length > 1 ? 'es' : ''} below.`,
        '',
        'Each file has git conflict markers (<<<<<<<, =======, >>>>>>>). Keep what both sides meant: usually both changes ' +
            'belong in the result, merged by hand, not one side or the other. Remove every marker.',
        '',
        'Rules:',
        '- Change only the files named below. Everything else in the update is already right.',
        '- Do not commit, push, or run any git command that changes the repository, and do not sync the storefront.',
        '- Explain to the user in plain words what each side changed and how you combined them.',
        '',
        ...items.map(describeOne),
    ].join('\n');
}
