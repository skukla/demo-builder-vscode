/**
 * Block libraries on the Configure screen (EDS-39) — the host side.
 *
 * Two pure halves, both free of `vscode`:
 *  - `buildBlockLibraryChoices` — what the screen offers. The same lists the
 *    creation wizard derives in `StorefrontStep`, from the same loader, so the
 *    two surfaces cannot offer different libraries for one project.
 *  - `applyBlockLibrarySelection` — what Save records on the project.
 *
 * Save only RECORDS. Nothing here copies or deletes block files, and
 * `installedBlockLibraries` is never written: a newly recorded library is offered
 * as "<library>: install" by the update check (`findUninstalledBlockLibraries`
 * in `@/features/updates/services/blockLibraryInstall`), and a library that is
 * no longer recorded keeps the blocks it already added to the storefront.
 *
 * @module features/dashboard/services/configureBlockLibraries
 */

import { COMPONENT_IDS } from '@/core/constants';
import {
    getAvailableBlockLibraries,
    getNativeBlockLibraries,
} from '@/features/components/services/blockLibraryLoader';
import { getStackById } from '@/features/components/services/demoPackageLoader';
import { parseCustomBlockLibrarySettings } from '@/features/project-creation/services/customBlockLibraryUtils';
import type { Project } from '@/types/base';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import { isEdsProject } from '@/types/typeGuards';
import type { ConfigureBlockLibraryChoices } from '@/types/webviewPayloads';

/**
 * The block-library half of a `save-configuration` message. `unknown` because
 * it arrives from a webview: this module is where it is checked.
 */
export interface BlockLibrarySelectionInput {
    selectedBlockLibraries?: unknown;
    customBlockLibraries?: unknown;
}

const NO_CHOICES: ConfigureBlockLibraryChoices = { native: [], available: [], customDefaults: [] };

/**
 * The libraries the Configure screen offers for this project.
 *
 * @param project - the project being configured
 * @param customLibrarySetting - the `demoBuilder.blockLibraries.custom` setting as
 *   read; a hand-edited settings file can hold anything, so it is checked here
 * @returns the three lists, all empty unless the project's stack is Edge Delivery
 */
export function buildBlockLibraryChoices(
    project: Project,
    customLibrarySetting: unknown,
): ConfigureBlockLibraryChoices {
    const stack = getStackById(project.selectedStack ?? '');
    if (stack?.frontend !== COMPONENT_IDS.EDS_STOREFRONT) return NO_CHOICES;
    const packageId = project.selectedPackage ?? '';
    return {
        native: getNativeBlockLibraries(stack, packageId),
        available: getAvailableBlockLibraries(stack, packageId),
        customDefaults: parseCustomBlockLibrarySettings(
            Array.isArray(customLibrarySetting)
                ? customLibrarySetting.filter(isNonEmptyString)
                : [],
        ),
    };
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

function isCustomBlockLibrary(value: unknown): value is CustomBlockLibrary {
    if (typeof value !== 'object' || value === null) return false;
    const { name, source } = value as Partial<CustomBlockLibrary>;
    if (!isNonEmptyString(name) || typeof source !== 'object' || source === null) return false;
    return [source.owner, source.repo, source.branch].every(isNonEmptyString);
}

function sameJson(a: unknown, b: unknown): boolean {
    return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

/**
 * Record the block libraries a Configure save carries.
 *
 * A field the save does not carry (or carries as something other than a list)
 * is left exactly as it was, so a save from a window that never touched the
 * picker cannot undo a selection made elsewhere.
 *
 * @param project - the project to record on (mutated)
 * @param input - the block-library half of the save message
 * @returns whether anything recorded on the project changed
 */
export function applyBlockLibrarySelection(
    project: Project,
    input: BlockLibrarySelectionInput,
): boolean {
    if (!isEdsProject(project)) return false;
    let changed = false;

    if (Array.isArray(input.selectedBlockLibraries)) {
        const ids = [...new Set(input.selectedBlockLibraries.filter(isNonEmptyString))];
        if (!sameJson(ids, project.selectedBlockLibraries)) {
            project.selectedBlockLibraries = ids;
            changed = true;
        }
    }
    if (Array.isArray(input.customBlockLibraries)) {
        const libraries = input.customBlockLibraries.filter(isCustomBlockLibrary);
        if (!sameJson(libraries, project.customBlockLibraries)) {
            project.customBlockLibraries = libraries;
            changed = true;
        }
    }
    return changed;
}
