/**
 * InstallStepBuilder
 *
 * Builds installation steps for prerequisites.
 */

import type { PrerequisiteDefinition, InstallStep } from '../types';
import { TIMEOUTS } from '@/core/utils';

export interface InstallStepsResult {
    steps: InstallStep[];
    manual?: boolean;
    url?: string;
}

/**
 * Transform template step to versioned install step (SOP §6 compliance)
 *
 * Replaces {version} placeholder in string properties and applies defaults.
 */
function toVersionedInstallStep(
    templateStep: Partial<InstallStep>,
    version: string,
): InstallStep {
    const replaceVersion = (str: string | undefined): string | undefined =>
        str?.replace(/{version}/g, version);

    return {
        name: replaceVersion(templateStep.name) || `Install Node.js ${version}`,
        message: replaceVersion(templateStep.message) || `Installing Node.js ${version}`,
        commandTemplate: replaceVersion(templateStep.commandTemplate),
        commands: templateStep.commands,
        progressStrategy: templateStep.progressStrategy || 'synthetic',
        progressParser: templateStep.progressParser,
        // SOP §1: Using TIMEOUTS constant for default step duration
        estimatedDuration: templateStep.estimatedDuration || TIMEOUTS.NORMAL,
        milestones: templateStep.milestones,
        continueOnError: templateStep.continueOnError,
    };
}

/**
 * Get installation steps for a prerequisite
 * @param prereq - Prerequisite definition
 * @param options - Optional configuration for installation
 * @returns Installation steps or null if not installable
 */
export function getInstallSteps(
    prereq: PrerequisiteDefinition,
    options?: {
        nodeVersions?: string[];
        preferredMethod?: string;
    },
): InstallStepsResult | null {
    if (!prereq.install) {
        return null;
    }

    // Check for manual installation
    if (prereq.install.manual) {
        return {
            steps: [],
            manual: true,
            url: prereq.install.url,
        };
    }

    // Handle dynamic installation (e.g., Node.js with versions) - convert to steps
    if (prereq.install && prereq.install.dynamic && prereq.install.steps) {
        // Adobe CLI adapts to component needs - no default version needed
        const versions = options?.nodeVersions || [];
        const templateSteps = prereq.install.steps;
        // Create a step for each version and each template step
        const steps: InstallStep[] = versions.flatMap(version =>
            templateSteps.map(templateStep => toVersionedInstallStep(templateStep, version)),
        );
        return { steps };
    }

    // Return steps directly if available
    if (prereq.install.steps) {
        return {
            steps: prereq.install.steps,
        };
    }

    return null;
}
