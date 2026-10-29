/**
 * Prerequisite Handlers - Shared Types and Utilities
 *
 * The one import path the check, continue and install handlers (and
 * PrerequisitesManager) use. Each job lives in its own file and is re-exported
 * here, so `jest.mock` of this path keeps intercepting every handler's calls:
 *
 *   nodeVersionRequirements.ts    - which Node majors the selection needs
 *   prerequisiteStatusMessages.ts - status values and the words the step shows
 *   perNodeVersionStatus.ts       - the per-Node-major install check
 *   prerequisiteCheckError.ts     - a check that threw or timed out
 *
 * The dependency gate stays here: it reads the handlers' shared state and has
 * no other home.
 */

import type { PrerequisiteDefinition } from '../services/PrerequisitesManager';
import { HandlerContext } from '@/types/handlers';

export {
    getNodeVersionKeys,
    getNodeVersionMapping,
    hasNodeVersions,
    perNodeVersionMajors,
} from './nodeVersionRequirements';
export type { NodeVersionMapping } from './nodeVersionRequirements';
export {
    determinePrerequisiteStatus,
    formatProgressMessage,
    formatVersionSuffix,
    getPrerequisiteDisplayMessage,
    getPrerequisiteStatusMessage,
} from './prerequisiteStatusMessages';
export type { PerNodeVersionStatusEntry } from './prerequisiteStatusMessages';
export { checkPerNodeVersionStatus, resolvePerNodeVariantStatus } from './perNodeVersionStatus';
export type { PerNodeVariantStatus } from './perNodeVersionStatus';
export { handlePrerequisiteCheckError } from './prerequisiteCheckError';

/**
 * Check if all dependencies for a prerequisite are installed
 *
 * Used to gate installation until dependencies are satisfied.
 */
export function areDependenciesInstalled(
    prereq: PrerequisiteDefinition,
    context: HandlerContext,
): boolean {
    if (!prereq.depends || prereq.depends.length === 0) {
        return true;
    }

    const states = context.sharedState.currentPrerequisiteStates;
    if (!states) {
        return false;
    }

    return prereq.depends.every((depId: string) => {
        for (const entry of states.values()) {
            if (entry.prereq.id === depId) {
                // Special handling: if dependency is Node and required majors missing, treat as not installed
                if (depId === 'node' && entry.nodeVersionStatus?.some((v) => !v.installed)) {
                    return false;
                }
                return !!entry.result?.installed;
            }
        }
        return false;
    });
}
