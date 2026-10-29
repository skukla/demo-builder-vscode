/**
 * Prerequisite Handlers - status and message wording
 *
 * Pure helpers that turn a prerequisite's install state into the status
 * value and the words the Prerequisites step shows.
 */

import type { PrerequisiteDefinition } from '../services/PrerequisitesManager';
import { getNodeVersionKeys, hasNodeVersions, NodeVersionMapping } from './nodeVersionRequirements';

/**
 * Format progress message for prerequisite checking
 *
 * For Node.js with multiple required versions, shows which versions are being checked.
 * Example: "Checking Node.js (v20, v24)"
 *
 * SOP §2: Extracted helper for progress message generation
 *
 * @param prereq - The prerequisite definition
 * @param nodeVersionMapping - Node version mapping (major version → component name)
 * @returns Progress message string
 */
export function formatProgressMessage(
    prereq: PrerequisiteDefinition,
    nodeVersionMapping: NodeVersionMapping,
): string {
    // For Node.js with multiple required versions, show which versions
    if (prereq.id === 'node' && hasNodeVersions(nodeVersionMapping)) {
        const versions = getNodeVersionKeys(nodeVersionMapping);
        if (versions.length > 1) {
            return `Checking ${prereq.name} (v${versions.join(', v')})`;
        }
    }
    return `Checking ${prereq.name}`;
}

/**
 * Format version suffix for prerequisite installation log
 *
 * For Node.js with multiple installed versions, shows all versions.
 * Example: ": v20.19.5, v24.0.0"
 *
 * SOP §2: Extracted helper for version display generation
 *
 * @param prereq - The prerequisite definition
 * @param nodeVersionStatus - Array of node version status entries
 * @param defaultVersion - Default single version to show if not multi-version
 * @returns Version suffix string (includes leading colon and space)
 */
export function formatVersionSuffix(
    prereq: PrerequisiteDefinition,
    nodeVersionStatus: Array<{ version: string; installed: boolean }> | undefined,
    defaultVersion?: string,
): string {
    // For Node.js with multiple versions, show all installed versions
    if (prereq.id === 'node' && nodeVersionStatus && nodeVersionStatus.length > 1) {
        const installedVersions = nodeVersionStatus
            .filter((v) => v.installed)
            .map((v) => v.version.replace('Node ', 'v'));
        if (installedVersions.length > 0) {
            return `: ${installedVersions.join(', ')}`;
        }
    }
    // Default: show single version
    return defaultVersion ? `: ${defaultVersion}` : '';
}

/**
 * Determine prerequisite status based on installation state
 *
 * @param installed - Whether the prerequisite is installed
 * @param optional - Whether the prerequisite is optional
 * @returns Status: 'success' if installed, 'warning' if optional and missing, 'error' if required and missing
 */
export function determinePrerequisiteStatus(
    installed: boolean,
    optional: boolean,
): 'success' | 'error' | 'warning' {
    if (installed) return 'success';
    return optional ? 'warning' : 'error';
}

/**
 * Generate user-friendly status message for a prerequisite
 *
 * @param prereqName - Name of the prerequisite
 * @param installed - Whether the prerequisite is installed
 * @param version - Detected version (if any)
 * @param perNodeVariantMissing - Whether a per-node-version variant is missing
 * @param missingVariantMajors - Array of Node major versions where the tool is missing
 * @returns User-friendly status message
 */
export function getPrerequisiteStatusMessage(
    prereqName: string,
    installed: boolean,
    version?: string,
    perNodeVariantMissing?: boolean,
    missingVariantMajors?: string[],
): string {
    if (perNodeVariantMissing && missingVariantMajors && missingVariantMajors.length > 0) {
        return `${prereqName} is missing in Node ${missingVariantMajors.join(', ')}`;
    }
    if (installed) {
        return version ? `${prereqName} is installed: ${version}` : `${prereqName} is installed`;
    }
    return `${prereqName} is not installed`;
}

/**
 * Per-node-version status entry
 */
export interface PerNodeVersionStatusEntry {
    version: string;
    major: string;
    component: string;
    installed: boolean;
}

/**
 * Get display message for prerequisite based on installation state
 *
 * SOP §3: Extracted nested ternary to named helper
 *
 * @param prereqName - Name of the prerequisite
 * @param isPerNodeVersion - Whether this is a per-node-version prerequisite
 * @param perNodeVersionStatus - Array of per-node version status entries
 * @param perNodeVariantMissing - Whether a per-node-version variant is missing
 * @param missingVariantMajors - Array of Node major versions where the tool is missing
 * @param installed - Whether the prerequisite is installed
 * @param version - Detected version (if any)
 * @returns User-friendly display message
 */
export function getPrerequisiteDisplayMessage(
    prereqName: string,
    isPerNodeVersion: boolean,
    perNodeVersionStatus: PerNodeVersionStatusEntry[],
    perNodeVariantMissing: boolean,
    missingVariantMajors: string[],
    installed: boolean,
    version?: string,
): string {
    // Per-node-version with installed versions: show "Installed for versions:"
    if (isPerNodeVersion && perNodeVersionStatus && perNodeVersionStatus.length > 0) {
        return 'Installed for versions:';
    }
    // Per-node-version with missing variants: show detailed missing message
    if (isPerNodeVersion && perNodeVariantMissing) {
        return `${prereqName} is missing in Node ${missingVariantMajors.join(', ')}. Plugin status will be checked after CLI is installed.`;
    }
    // Standard case: use status message
    return getPrerequisiteStatusMessage(prereqName, installed, version);
}
