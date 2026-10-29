/**
 * The block library work a Configure save leaves pending (EDS-39), and running it.
 *
 * What is pending is computed from the PROJECT, never from the one save:
 *  - selected and not installed → install (`findUninstalledBlockLibraries`);
 *  - installed and not selected → remove (`findUnselectedInstalledBlockLibraries`).
 * So an SC who answers "Later" is offered the same work by the next save.
 *
 * Running it is two existing cores in a fixed order — removals, then installs.
 * A library unticked in the same save as another is ticked must give up its
 * blocks before the new one is copied in; the other way round the installer
 * skips any block folder the two share and the old library's copy stays.
 *
 * UI-free: it answers the lines to show and the caller shows them, after
 * refreshing the DA.live block list when a block was added or removed
 * (`commands/configureBlockLibraryExecutor.ts`). It writes to GitHub and
 * DA.live, so it runs only after the SC presses the notification's action.
 *
 * @module features/dashboard/services/configureBlockLibraryWork
 */

import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { sanitizeErrorForLogging } from '@/core/validation/SensitiveDataRedactor';
import type { BlockLibraryEntry } from '@/features/eds/services/blockCollectionHelpers';
import {
    applyBlockLibraryInstall,
    describeInstallOutcome,
    findUninstalledBlockLibraries,
} from '@/features/updates/services/blockLibraryInstall';
import {
    applyBlockLibraryUninstall,
    describeUninstallOutcome,
    findUnselectedInstalledBlockLibraries,
    type BlockLibraryUninstallDeps,
    type BlockLibraryUninstallOutcome,
} from '@/features/updates/services/blockLibraryUninstall';
import type { UpdateContext } from '@/features/updates/services/updateCore';
import type { Project } from '@/types/base';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';

export interface PendingBlockLibraryWork {
    /** Selected, and not in the storefront yet. */
    install: BlockLibraryEntry[];
    /** In the storefront, and no longer selected. */
    remove: InstalledBlockLibrary[];
}

/** What the two cores need: the installer's update context and the remover's collaborators. */
export interface BlockLibraryWorkDeps {
    updateContext: UpdateContext;
    uninstall: BlockLibraryUninstallDeps;
}

/** One line for the SC, and how loudly to say it. */
export interface BlockLibraryWorkLine {
    level: 'info' | 'warning' | 'error';
    text: string;
}

/** What a run did: the lines to show, and whether the storefront repository changed. */
export interface BlockLibraryWorkResult {
    /** One line per library, in the order they ran. */
    lines: BlockLibraryWorkLine[];
    /**
     * At least one block was added or removed, so the DA.live block list no
     * longer matches the storefront until it is refreshed.
     */
    storefrontChanged: boolean;
    /** The blocks the installs added: the only doc pages the DA.live refresh must publish. */
    addedBlockIds: string[];
}

/** The block library work this project has pending. */
export function findPendingBlockLibraryWork(project: Project): PendingBlockLibraryWork {
    return {
        install: findUninstalledBlockLibraries(project),
        remove: findUnselectedInstalledBlockLibraries(project),
    };
}

/** Whether applying storefront changes has any library to add or remove. */
export function hasPendingBlockLibraryWork(project: Project): boolean {
    const { install, remove } = findPendingBlockLibraryWork(project);
    return install.length + remove.length > 0;
}

/**
 * The sentence the apply notification adds so the SC knows which libraries
 * pressing its action will add and remove. Empty when none are pending; starts
 * with a space so it can follow the notification's own sentence.
 */
export function describePendingBlockLibraryWork(project: Project): string {
    const { install, remove } = findPendingBlockLibraryWork(project);
    const names = (libraries: Array<{ name: string }>): string =>
        libraries.map((library) => library.name).join(', ');
    const parts = [
        ...(install.length > 0 ? [`add ${names(install)}`] : []),
        ...(remove.length > 0 ? [`remove ${names(remove)}`] : []),
    ];
    return parts.length > 0 ? ` Block libraries: ${parts.join('; ')}.` : '';
}

function removalLevel(outcome: BlockLibraryUninstallOutcome): BlockLibraryWorkLine['level'] {
    const incomplete =
        outcome.leftBlocks.length + outcome.leftEntries.length > 0 || Boolean(outcome.daLiveError);
    return incomplete ? 'warning' : 'info';
}

function failure(verb: string, error: unknown): BlockLibraryWorkLine {
    return { level: 'error', text: `Failed to ${verb}: ${sanitizeErrorForLogging(error as Error)}` };
}

/**
 * Run the project's pending block library work: removals, then installs. One
 * library failing does not stop the others; each answers its own line.
 *
 * @param project - the project (its `installedBlockLibraries` is updated and saved)
 * @param deps - the installer's context and the remover's collaborators
 * @param onProgress - told each stage as it starts, with the library it is on
 * @returns one line per library, whether any block was added or removed, and which were added
 */
export async function applyPendingBlockLibraryWork(
    project: Project,
    deps: BlockLibraryWorkDeps,
    onProgress?: (stage: string, step: string) => void,
): Promise<BlockLibraryWorkResult> {
    const { install, remove } = findPendingBlockLibraryWork(project);
    const lines: BlockLibraryWorkLine[] = [];
    const addedBlockIds: string[] = [];
    let storefrontChanged = false;

    for (const library of remove) {
        onProgress?.(OPERATION_STAGES.removingBlockLibraries.label, library.name);
        try {
            const outcome = await applyBlockLibraryUninstall({ project, library }, deps.uninstall);
            storefrontChanged ||= outcome.removedBlockIds.length > 0;
            lines.push({
                level: removalLevel(outcome),
                // The progress modal's own screen names the project, so the short form.
                text: describeUninstallOutcome(outcome),
            });
        } catch (error) {
            deps.uninstall.logger.error(`[Configure] Block library removal failed: ${library.name}`, error as Error);
            lines.push(failure(`remove ${library.name}`, error));
        }
    }
    for (const library of install) {
        onProgress?.(OPERATION_STAGES.addingBlockLibraries.label, library.name);
        try {
            const outcome = await applyBlockLibraryInstall({ project, library }, deps.updateContext);
            storefrontChanged ||= outcome.blockIds.length > 0;
            addedBlockIds.push(...outcome.blockIds);
            lines.push({ level: 'info', text: describeInstallOutcome(outcome) });
        } catch (error) {
            deps.updateContext.logger.error(`[Configure] Block library install failed: ${library.name}`, error as Error);
            lines.push(failure(`install ${library.name}`, error));
        }
    }
    return { lines, storefrontChanged, addedBlockIds };
}
